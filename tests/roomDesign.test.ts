import { describe, expect, it } from "vitest";
import { resolveRosterProject } from "../src/core/project";
import {
  builtinRoomBackground,
  createCompetitionRoomDesign,
  createCustomRoomTextBox,
  createDefaultRoomHud,
  defaultRoomSeasonTitle,
  getDefaultRoomTitleTextStyle,
  getRoomTextStylePresetsForRole,
  normalizeRoomDesign
} from "../src/core/room";
import { defaultFontFamily, genshinFontFamily } from "../src/core/fonts";
import type { RosterProject } from "../src/types";

const legacyProject: RosterProject = {
  id: "default",
  name: "default",
  teams: {
    left: { label: "left", slots: [] },
    right: { label: "right", slots: [] }
  },
  style: {
    resolution: { width: 1920, height: 1080 },
    cardGap: 14,
    imageScale: 1,
    cardBackground: "transparent",
    showElementIcon: true
  }
};

describe("room design v3", () => {
  it("normalizes old projects with a competition room design", () => {
    const resolved = resolveRosterProject(legacyProject, []);

    expect(resolved.room?.mode).toBe("competition");
    expect(resolved.room?.background.visible).toBe(true);
    expect(resolved.room?.background.imagePath).toBe(builtinRoomBackground);
    expect(resolved.room?.guides).toEqual({ visible: false, mode: "safe" });
    expect(resolved.room?.textBoxes.map((box) => box.role)).toEqual([
      "title",
      "player-left",
      "player-right",
      "score-left",
      "score-right"
    ]);
    expect(resolved.room?.textBoxes.find((box) => box.role === "title")?.text).toBe(defaultRoomSeasonTitle);
    expect(resolved.room?.textBoxes.every((box) => box.background === "transparent")).toBe(true);
    expect(resolved.room?.textBoxes.find((box) => box.role === "title")?.fontSize).toBeGreaterThanOrEqual(62);
    expect(resolved.room?.textBoxes.find((box) => box.role === "player-left")?.fontSize).toBeGreaterThanOrEqual(34);
    expect(resolved.room?.textBoxes.find((box) => box.role === "score-left")?.fontSize).toBeGreaterThanOrEqual(90);
    expect(resolved.room?.textBoxes.find((box) => box.role === "title")).toMatchObject({
      color: "#dbea9b",
      fillStyle: "s3-lead-prism",
      fontSize: 72
    });
    expect(resolved.room?.textBoxes.find((box) => box.role === "player-left")?.color).toBe("#e42732");
    expect(resolved.room?.textBoxes.find((box) => box.role === "player-right")?.color).toBe("#2458e8");
    expect(resolved.room?.textBoxes.find((box) => box.role === "score-left")?.color).toBe("#e42732");
    expect(resolved.room?.textBoxes.find((box) => box.role === "score-right")?.color).toBe("#2458e8");
    expect(resolved.room?.textBoxes.find((box) => box.role === "player-left")?.strokeColor).toBe("transparent");
    expect(resolved.room?.textBoxes.find((box) => box.role === "player-right")?.strokeColor).toBe("transparent");
    expect(resolved.room?.textBoxes.find((box) => box.role === "title")?.strokeEnabled).toBe(true);
    expect(resolved.room?.textBoxes.find((box) => box.role === "player-left")?.strokeEnabled).toBe(false);
  });

  it("normalizes text box background opacity independently from text opacity", () => {
    expect(createCustomRoomTextBox().backgroundOpacity).toBe(0);
    expect(normalizeRoomDesign().textBoxes.every((box) => box.backgroundOpacity === 0)).toBe(true);

    const { backgroundOpacity: _removedBackgroundOpacity, ...legacyVisibleBox } = {
      ...createCustomRoomTextBox(),
      background: "#ffffff"
    };
    const visibleBackground = normalizeRoomDesign({
      mode: "free",
      textBoxes: [legacyVisibleBox as ReturnType<typeof createCustomRoomTextBox>]
    });
    expect(visibleBackground.textBoxes[0]).toMatchObject({
      background: "#ffffff",
      backgroundOpacity: 1
    });

    const translucentBackground = normalizeRoomDesign({
      mode: "free",
      textBoxes: [
        {
          ...createCustomRoomTextBox(),
          background: "#112233",
          backgroundOpacity: 0.35
        }
      ]
    });
    expect(translucentBackground.textBoxes[0]).toMatchObject({
      background: "#112233",
      backgroundOpacity: 0.35,
      opacity: 1
    });
  });

  it("normalizes background edge blur for live room backgrounds", () => {
    expect(normalizeRoomDesign().background.edgeBlur).toBe(0);

    expect(
      normalizeRoomDesign({
        background: {
          visible: true,
          fit: "cover",
          opacity: 1,
          dim: 0.12,
          edgeBlur: 32
        }
      }).background.edgeBlur
    ).toBe(32);

    expect(
      normalizeRoomDesign({
        background: {
          visible: true,
          fit: "cover",
          opacity: 1,
          dim: 0.12,
          edgeBlur: 999
        }
      }).background.edgeBlur
    ).toBe(80);
  });

  it("keeps existing competition text when reapplying the preset", () => {
    const current = normalizeRoomDesign({
      textBoxes: [
        { ...createCustomRoomTextBox(), id: "room-title", role: "title", text: "Grand Finals" },
        { ...createCustomRoomTextBox(), id: "room-player-left", role: "player-left", text: "Nightfall" },
        { ...createCustomRoomTextBox(), id: "room-player-right", role: "player-right", text: "RedHair" },
        createCustomRoomTextBox(3)
      ]
    });

    const next = createCompetitionRoomDesign(current);

    expect(next.textBoxes).toHaveLength(5);
    expect(next.textBoxes.slice(0, 3).map((box) => box.text)).toEqual(["Grand Finals", "Nightfall", "RedHair"]);
  });

  it("preserves intentionally empty competition text", () => {
    const room = normalizeRoomDesign({
      mode: "competition",
      textBoxes: [
        { ...createCustomRoomTextBox(), id: "room-title", role: "title", text: "" },
        { ...createCustomRoomTextBox(), id: "room-player-left", role: "player-left", text: "" }
      ]
    });
    const byRole = new Map(room.textBoxes.map((box) => [box.role, box]));

    expect(byRole.get("title")?.text).toBe("");
    expect(byRole.get("player-left")?.text).toBe("");

    const next = createCompetitionRoomDesign(room);
    const nextByRole = new Map(next.textBoxes.map((box) => [box.role, box]));

    expect(nextByRole.get("title")?.text).toBe("");
    expect(nextByRole.get("player-left")?.text).toBe("");
  });

  it("adds missing score boxes to existing competition rooms", () => {
    const room = normalizeRoomDesign({
      mode: "competition",
      textBoxes: [
        { ...createCustomRoomTextBox(), id: "room-title", role: "title", text: "S2" },
        { ...createCustomRoomTextBox(), id: "room-player-left", role: "player-left", text: "Left" },
        { ...createCustomRoomTextBox(), id: "room-player-right", role: "player-right", text: "Right" }
      ]
    });

    expect(room.textBoxes.map((box) => box.role)).toEqual([
      "title",
      "player-left",
      "player-right",
      "score-left",
      "score-right"
    ]);
  });

  it("keeps competition preset text outside roster edge rails", () => {
    const room = normalizeRoomDesign();
    const byRole = new Map(room.textBoxes.map((box) => [box.role, box]));

    expect(byRole.get("title")).toMatchObject({
      x: 500,
      y: 38,
      width: 920,
      fontSize: 72,
      color: "#dbea9b",
      fillStyle: "s3-lead-prism",
      strokeEnabled: true,
      strokeColor: "#527f57",
      strokeWidth: 1
    });
    expect(byRole.get("score-left")).toMatchObject({ x: 206, y: 78, width: 260, fontSize: 118, strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 });
    expect(byRole.get("player-left")).toMatchObject({ x: 466, y: 112, width: 400, fontSize: 58, color: "#e42732", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 });
    expect(byRole.get("player-right")).toMatchObject({ x: 1054, y: 112, width: 400, fontSize: 58, color: "#2458e8", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 });
    expect(byRole.get("score-right")).toMatchObject({ x: 1454, y: 78, width: 260, fontSize: 118, strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 });
  });

  it("migrates legacy default competition text positions away from roster rails", () => {
    const room = normalizeRoomDesign({
      mode: "competition",
      textBoxes: [
        { ...createCustomRoomTextBox(), id: "room-player-left", role: "player-left", text: "Nightfall", x: 304, y: 122, width: 370, height: 62 },
        { ...createCustomRoomTextBox(), id: "room-player-right", role: "player-right", text: "RedHair", x: 1246, y: 122, width: 370, height: 62 },
        { ...createCustomRoomTextBox(), id: "room-score-left", role: "score-left", text: "9", x: 198, y: 106, width: 110, height: 92 },
        { ...createCustomRoomTextBox(), id: "room-score-right", role: "score-right", text: "1", x: 1616, y: 106, width: 110, height: 92 }
      ]
    });
    const byRole = new Map(room.textBoxes.map((box) => [box.role, box]));

    expect(byRole.get("player-left")).toMatchObject({ text: "Nightfall", x: 466, y: 112 });
    expect(byRole.get("player-right")).toMatchObject({ text: "RedHair", x: 1054, y: 112 });
    expect(byRole.get("score-left")).toMatchObject({ text: "9", x: 206, y: 78 });
    expect(byRole.get("score-right")).toMatchObject({ text: "1", x: 1454, y: 78 });
    expect(byRole.get("player-left")).toMatchObject({ color: "#e42732", fontSize: 58, strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 });
    expect(byRole.get("player-right")).toMatchObject({ color: "#2458e8", fontSize: 58, strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 });
  });

  it("upgrades previous default player name size in competition rooms", () => {
    const room = normalizeRoomDesign({
      mode: "competition",
      textBoxes: [
        {
          ...createCustomRoomTextBox(),
          id: "room-player-left",
          role: "player-left",
          text: "白河愁",
          x: 492,
          y: 120,
          width: 330,
          height: 62,
          fontSize: 46,
          color: "#e42732",
          strokeColor: "#ffffff",
          background: "transparent",
          borderColor: "transparent",
          borderWidth: 0
        },
        {
          ...createCustomRoomTextBox(),
          id: "room-player-right",
          role: "player-right",
          text: "南南",
          x: 1098,
          y: 120,
          width: 330,
          height: 62,
          fontSize: 46,
          color: "#2458e8",
          strokeColor: "#ffffff",
          background: "transparent",
          borderColor: "transparent",
          borderWidth: 0
        }
      ]
    });
    const byRole = new Map(room.textBoxes.map((box) => [box.role, box]));

    expect(byRole.get("player-left")).toMatchObject({ text: "白河愁", x: 466, y: 112, width: 400, height: 84, fontSize: 58 });
    expect(byRole.get("player-right")).toMatchObject({ text: "南南", x: 1054, y: 112, width: 400, height: 84, fontSize: 58 });
  });

  it("upgrades the previous default S3 title without overriding customized geometry", () => {
    const current = normalizeRoomDesign();
    const previousDefault = current.textBoxes.map((box) =>
      box.role === "title"
        ? {
            ...box,
            y: 20,
            height: 108,
            fontFamily: genshinFontFamily,
            fontSize: 82,
            color: "#cfe593"
          }
        : box
    );
    const migrated = normalizeRoomDesign({
      mode: "competition",
      textBoxes: previousDefault
    });
    expect(migrated.textBoxes.find((box) => box.role === "title")).toMatchObject({
      x: 500,
      y: 38,
      width: 920,
      height: 96,
      fontFamily: defaultFontFamily,
      fontSize: 72
    });

    const customized = normalizeRoomDesign({
      mode: "competition",
      textBoxes: previousDefault.map((box) => (box.role === "title" ? { ...box, x: 520 } : box))
    });
    expect(customized.textBoxes.find((box) => box.role === "title")).toMatchObject({
      x: 520,
      y: 20,
      fontFamily: genshinFontFamily,
      fontSize: 82
    });
  });

  it("upgrades the v3.4.6 default S3 title color while preserving customized colors", () => {
    const current = normalizeRoomDesign();
    const previousDefault = current.textBoxes.map((box) =>
      box.role === "title" ? { ...box, color: "#cfe593" } : box
    );

    const migrated = normalizeRoomDesign({ mode: "competition", textBoxes: previousDefault });
    expect(migrated.textBoxes.find((box) => box.role === "title")).toMatchObject({ color: "#dbea9b" });

    const customized = normalizeRoomDesign({
      mode: "competition",
      textBoxes: previousDefault.map((box) => (box.role === "title" ? { ...box, color: "#f4c6d8" } : box))
    });
    expect(customized.textBoxes.find((box) => box.role === "title")).toMatchObject({ color: "#f4c6d8" });
  });

  it("upgrades old default white competition text colors on the current layout", () => {
    const currentDefault = normalizeRoomDesign();
    const room = normalizeRoomDesign({
      mode: "competition",
      textBoxes: currentDefault.textBoxes.map((box) => ({
        ...box,
        color: "#ffffff"
      }))
    });
    const byRole = new Map(room.textBoxes.map((box) => [box.role, box]));

    expect(byRole.get("title")).toMatchObject({ color: "#dbea9b", fillStyle: "s3-lead-prism" });
    expect(byRole.get("player-left")).toMatchObject({ color: "#e42732" });
    expect(byRole.get("player-right")).toMatchObject({ color: "#2458e8" });
    expect(byRole.get("score-left")).toMatchObject({ color: "#e42732" });
    expect(byRole.get("score-right")).toMatchObject({ color: "#2458e8" });
  });

  it("offers role-specific typography presets for title and red/blue players", () => {
    expect(getRoomTextStylePresetsForRole("title").map((preset) => preset.id)).toEqual([
      "s3-lead-prism",
      "league-gold",
      "league-white",
      "league-blue",
      "league-red"
    ]);
    expect(getRoomTextStylePresetsForRole("title")[0]).toMatchObject({
      id: "s3-lead-prism",
      style: {
        color: "#dbea9b",
        fillStyle: "s3-lead-prism",
        strokeEnabled: true,
        strokeColor: "#527f57",
        strokeWidth: 1,
        background: "transparent",
        backgroundOpacity: 0,
        borderColor: "transparent",
        borderWidth: 0,
        radius: 0
      }
    });
    expect(getDefaultRoomTitleTextStyle()).toMatchObject({
      color: "#dbea9b",
      fillStyle: "s3-lead-prism",
      background: "transparent",
      backgroundOpacity: 0,
      borderColor: "transparent",
      borderWidth: 0,
      strokeEnabled: true,
      strokeColor: "#527f57",
      strokeWidth: 1
    });
    expect(getRoomTextStylePresetsForRole("title")[1]).toMatchObject({
      id: "league-gold",
      style: {
        color: "#ffdc4a",
        fillStyle: "solid"
      }
    });
    expect(getRoomTextStylePresetsForRole("player-left")[0]).toMatchObject({
      id: "player-red",
      style: { color: "#e42732", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0, fontSize: 58 }
    });
    expect(getRoomTextStylePresetsForRole("player-right")[0]).toMatchObject({
      id: "player-blue",
      style: { color: "#2458e8", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0, fontSize: 58 }
    });
    expect(getRoomTextStylePresetsForRole("score-left")[0]).toMatchObject({
      id: "score-red",
      style: { color: "#e42732", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 }
    });
    expect(getRoomTextStylePresetsForRole("score-right")[0]).toMatchObject({
      id: "score-blue",
      style: { color: "#2458e8", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 }
    });
  });

  it("keeps only the seasonal title contour enabled by default", () => {
    const room = normalizeRoomDesign();
    expect(
      room.textBoxes.map((box) => ({
        role: box.role,
        strokeEnabled: box.strokeEnabled,
        strokeColor: box.strokeColor,
        strokeWidth: box.strokeWidth
      }))
    ).toEqual([
      { role: "title", strokeEnabled: true, strokeColor: "#527f57", strokeWidth: 1 },
      { role: "player-left", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 },
      { role: "player-right", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 },
      { role: "score-left", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 },
      { role: "score-right", strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0 }
    ]);
  });

  it("keeps font stroke switch separate from stroke width", () => {
    const room = normalizeRoomDesign({
      mode: "competition",
      textBoxes: [
        {
          ...createCustomRoomTextBox(),
          id: "room-title",
          role: "title",
          text: "S2",
          strokeEnabled: false,
          strokeColor: "#ffffff",
          strokeWidth: 2.2
        }
      ]
    });

    expect(room.textBoxes[0]).toMatchObject({
      role: "title",
      strokeEnabled: false,
      strokeColor: "#ffffff",
      strokeWidth: 2.2
    });
  });

  it("keeps edited competition text box layout and style during normalization", () => {
    const room = normalizeRoomDesign({
      mode: "competition",
      textBoxes: [
        {
          ...createCustomRoomTextBox(),
          id: "room-title",
          role: "title",
          text: "S3",
          x: 612,
          y: 88,
          width: 720,
          height: 120,
          fontWeight: 900,
          color: "#ff5500",
          align: "right"
        }
      ]
    });

    expect(room.textBoxes[0]).toMatchObject({
      role: "title",
      text: "S3",
      x: 612,
      y: 88,
      width: 720,
      height: 120,
      fontWeight: 900,
      color: "#ff5500",
      align: "right"
    });
  });

  it("clamps custom text boxes inside a 1920x1080 room canvas", () => {
    const room = normalizeRoomDesign({
      mode: "free",
      textBoxes: [
        {
          ...createCustomRoomTextBox(),
          x: 4000,
          y: -100,
          width: 40,
          height: 20,
          fontSize: 160
        }
      ]
    });

    expect(room.textBoxes[0].x).toBeLessThanOrEqual(1840);
    expect(room.textBoxes[0].y).toBe(0);
    expect(room.textBoxes[0].width).toBe(80);
    expect(room.textBoxes[0].height).toBe(34);
    expect(room.textBoxes[0].fontSize).toBe(120);
  });

  it("normalizes room alignment guide settings", () => {
    expect(normalizeRoomDesign({ guides: { visible: true, mode: "center" } }).guides).toEqual({
      visible: true,
      mode: "center"
    });

    expect(
      normalizeRoomDesign({ guides: { visible: true, mode: "bad-value" as "center" } }).guides
    ).toEqual({
      visible: true,
      mode: "safe"
    });
  });

  it("normalizes the broadcast HUD shell used by the reference live-room UI", () => {
    const room = normalizeRoomDesign();

    expect(room.hud).toMatchObject({
      titleImage: {
        visible: false,
        imagePath: "builtin:rock-league-title-v1",
        fit: "contain",
        opacity: 1
      },
      playerBar: {
        visible: true,
        leftVisible: true,
        rightVisible: true,
        scoreVisible: true,
        preset: "s3-clover-hinge",
        boText: "BO5",
        widthScale: 1,
        textScale: 1,
        avatarVisible: false,
        animation: true
      }
    });
    expect(room.hud?.playerBar.leftAvatarPath).toMatch(/^assets\/avatars\//);
    expect(room.hud?.playerBar.rightAvatarPath).toMatch(/^assets\/avatars\//);
  });

  it("preserves user-controlled broadcast HUD visibility and title image imports", () => {
    const room = normalizeRoomDesign({
      hud: {
        titleImage: {
          visible: true,
          imagePath: "imported-title.png",
          x: 720,
          y: 42,
          width: 480,
          height: 140,
          fit: "cover",
          opacity: 0.72
        },
        playerBar: {
          visible: true,
          leftVisible: false,
          rightVisible: true,
          scoreVisible: false,
          preset: "player-score",
          boText: "BO3",
          leftAvatarPath: "left-avatar.png",
          rightAvatarPath: "right-avatar.png",
          avatarVisible: true,
          animation: false
        }
      }
    });

    expect(room.hud?.titleImage).toMatchObject({
      visible: true,
      imagePath: "imported-title.png",
      x: 720,
      y: 42,
      width: 480,
      height: 140,
      fit: "cover",
      opacity: 0.72
    });
    expect(room.hud?.playerBar).toMatchObject({
      leftVisible: false,
      rightVisible: true,
      scoreVisible: false,
      preset: "player-score",
      boText: "BO3",
      widthScale: 1,
      textScale: 1,
      leftAvatarPath: "left-avatar.png",
      rightAvatarPath: "right-avatar.png",
      avatarVisible: true,
      animation: false
    });
  });

  it("normalizes adjustable player bar width and side text scale", () => {
    const room = normalizeRoomDesign({
      hud: {
        ...createDefaultRoomHud(),
        playerBar: {
          ...createDefaultRoomHud().playerBar,
          widthScale: 4,
          textScale: 0.2
        }
      }
    });

    expect(room.hud?.playerBar).toMatchObject({
      widthScale: 1.2,
      textScale: 0.7
    });
  });

  it.each(["s3-storybook", "s3-prism-bookmark", "s3-clover-hinge"] as const)(
    "preserves the new S3 %s live scoreboard preset",
    (preset) => {
      const room = normalizeRoomDesign({
        hud: {
          titleImage: {
            visible: false,
            imagePath: "builtin:rock-league-title-v1",
            x: 765,
            y: 34,
            width: 390,
            height: 118,
            fit: "contain",
            opacity: 1
          },
          playerBar: {
            visible: true,
            leftVisible: true,
            rightVisible: true,
            scoreVisible: true,
            preset,
            boText: "BO5",
            avatarVisible: false,
            animation: true
          }
        }
      });

      expect(room.hud?.playerBar.preset).toBe(preset);
    }
  );

  it.each(["split-panel", "score-left", "score-right"] as const)(
    "normalizes the retired %s live scoreboard preset to classic",
    (preset) => {
      const room = normalizeRoomDesign({
        hud: {
          titleImage: {
            visible: true,
            imagePath: "builtin:rock-league-title-v1",
            x: 765,
            y: 34,
            width: 390,
            height: 118,
            fit: "contain",
            opacity: 1
          },
          playerBar: {
            visible: true,
            leftVisible: true,
            rightVisible: true,
            scoreVisible: true,
            preset: preset as never,
            boText: "BO5",
            avatarVisible: false,
            animation: true
          }
        }
      });

      expect(room.hud?.playerBar.preset).toBe("classic");
    }
  );
});
