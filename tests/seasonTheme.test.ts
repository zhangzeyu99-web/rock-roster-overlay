import { describe, expect, it } from "vitest";
import type { RoomTextBox, RosterProject, SeasonTheme } from "../src/types";
import { createDefaultRosterProject, normalizeRosterStyle } from "../src/core/project";
import { createDefaultRoomDesign, normalizeRoomDesign, normalizeRoomTextBox, resolveRoomHudTextAppearance } from "../src/core/room";
import { genshinFontFamily } from "../src/core/fonts";
import { applySeasonTheme, getAppliedSeasonTheme } from "../src/core/season";
import { normalizeProject } from "../src/core/projectPresets";
import { createProjectPresetFile, parseProjectPresetFile } from "../src/core/projectPresetTransfer";

function titleOf(project: RosterProject): RoomTextBox {
  return project.room!.textBoxes.find((box) => box.role === "title")!;
}

function customizedProject(): RosterProject {
  const project = createDefaultRosterProject();
  project.id = "match-custom";
  project.name = "决赛直播";
  project.teams.left.label = "红队";
  project.teams.left.slots[0] = { name: "迪莫", assetId: "pet-dimo", defeated: true };
  project.style.teamLayout = { mode: "vertical", centerGap: 1410, verticalOffset: -12 };
  project.style.resolution = { width: 2560, height: 1440 };
  project.style.imageScale = 1.06;
  project.style.cardPlateScale = 1.12;
  project.style.teamVisibility = { left: true, right: false };
  Object.assign(titleOf(project), {
    text: "周末邀请赛", x: 410, y: 50, width: 980, height: 110,
    fontFamily: "Arial", fontSize: 64, fontWeight: 800, align: "left", opacity: 0.85
  });
  project.room!.textBoxes.push({
    ...titleOf(project), id: "sponsor", role: "custom", text: "解说：小洛",
    x: 650, y: 880, width: 450, height: 60, fontSize: 28,
    fillStyle: "solid", color: "#aabbcc", strokeEnabled: false,
    background: "#19283a", backgroundOpacity: 0.4, borderWidth: 2, borderColor: "#667788"
  });
  for (const box of project.room!.textBoxes) {
    if (box.role === "player-left") box.text = "左方长选手名称";
    if (box.role === "player-right") box.text = "右方选手";
    if (box.role === "score-left") box.text = "12";
    if (box.role === "score-right") box.text = "9";
  }
  Object.assign(project.room!.hud!.playerBar, {
    boText: "", widthScale: 0.83, textScale: 1.25, avatarVisible: true,
    leftAvatarPath: "assets/avatars/custom-left.png", rightVisible: false, animation: false
  });
  Object.assign(project.room!.hud!.titleImage, {
    visible: true, imagePath: "assets/custom-event.png", x: 300, y: 60, width: 420
  });
  return project;
}

function jsonRoundTrip(project: RosterProject): RosterProject {
  return parseProjectPresetFile(JSON.parse(JSON.stringify(createProjectPresetFile(project))));
}

it("uses role defaults when imported HUD boxes are reordered or omit sizes", () => {
  expect(normalizeRoomTextBox({ role: "score-left", text: "2" }, 0).fontSize).toBe(118);
  expect(normalizeRoomTextBox({ role: "player-right", text: "客队" }, 0).fontSize).toBe(58);
  expect(normalizeRoomTextBox({ role: "score-right", fontSize: 70 }, 1).fontSize).toBe(70);
});

it("retains customized scoreboard typography through repeated normalization", () => {
  const room = createDefaultRoomDesign();
  room.textBoxes.find((box) => box.role === "score-left")!.fontSize = 70;
  room.textBoxes.find((box) => box.role === "player-left")!.fontFamily = "Arial";
  room.textBoxes.find((box) => box.role === "score-right")!.color = "#ffffff";
  const result = normalizeRoomDesign(normalizeRoomDesign(room));
  expect(result.textBoxes.find((box) => box.role === "score-left")!.fontSize).toBe(70);
  expect(result.textBoxes.find((box) => box.role === "player-left")!.fontFamily).toBe("Arial");
  expect(result.textBoxes.find((box) => box.role === "score-right")!.color).toBe("#ffffff");
});

describe("season theme compatibility", () => {
  it("creates a complete S4 project without enabling the title image or avatars", () => {
    const project = normalizeProject(undefined);
    expect(getAppliedSeasonTheme(project)).toBe("s4");
    expect(titleOf(project).text).toBe("S4·月涌狂想");
    expect(project.room!.hud!.titleImage.visible).toBe(false);
    expect(project.room!.hud!.playerBar.avatarVisible).toBe(false);
  });

  it("normalizes an existing S3 project with no cloud theme as S3", () => {
    const old = createDefaultRosterProject();
    old.room = createDefaultRoomDesign();
    delete old.style.cloudTheme;
    const result = normalizeProject(JSON.parse(JSON.stringify(old)));
    expect(getAppliedSeasonTheme(result)).toBe("s3");
    expect(titleOf(result).text).toBe("S3·铅字幻梦");
    expect(normalizeRosterStyle(undefined).cloudTheme).toBe("s3");
  });

  it("does not replace an existing custom plain white title during normalization", () => {
    const old = customizedProject();
    old.room = createDefaultRoomDesign();
    Object.assign(titleOf(old), {
      text: "自定义白色赛事标题", fillStyle: "solid", color: "#ffffff",
      strokeEnabled: false, strokeColor: "transparent", strokeWidth: 0
    });
    const before = structuredClone(titleOf(old));
    expect(titleOf(normalizeProject(old))).toEqual(before);
  });

  it.each<SeasonTheme>(["s4", "s3"])("applies %s while preserving the match, layout, title geometry and custom boxes", (theme) => {
    const project = customizedProject();
    const before = structuredClone(project);
    const result = applySeasonTheme(project, theme);
    expect(project).toEqual(before);
    expect(result.teams).toEqual(before.teams);
    expect({ ...result.style, cloudTheme: before.style.cloudTheme }).toEqual(before.style);
    expect(titleOf(result)).toMatchObject({
      text: "周末邀请赛", x: 410, y: 50, width: 980, height: 110,
      fontFamily: "Arial", fontSize: 64, fontWeight: 800, align: "left", opacity: 0.85
    });
    expect(result.room!.textBoxes.filter((box) => box.role !== "title"))
      .toEqual(before.room!.textBoxes.filter((box) => box.role !== "title"));
    expect(result.room!.hud!.titleImage).toEqual(before.room!.hud!.titleImage);
    expect({ ...result.room!.hud!.playerBar, preset: before.room!.hud!.playerBar.preset })
      .toEqual(before.room!.hud!.playerBar);
    expect(getAppliedSeasonTheme(result)).toBe(theme);
  });

  it("switches standard season titles both ways and preserves the choice after JSON preset transfer", () => {
    let project = createDefaultRosterProject();
    for (const theme of ["s3", "s4", "s3"] as const) {
      project = jsonRoundTrip(applySeasonTheme(project, theme));
      expect(getAppliedSeasonTheme(project)).toBe(theme);
      expect(titleOf(project).text).toBe(theme === "s4" ? "S4·月涌狂想" : "S3·铅字幻梦");
    }
  });

  it.each<SeasonTheme>(["s4", "s3"])("round-trips a customized %s preset without losing content or empty match format", (theme) => {
    const project = applySeasonTheme(customizedProject(), theme);
    const result = jsonRoundTrip(project);
    expect(result).toEqual(normalizeProject(project));
    expect(getAppliedSeasonTheme(result)).toBe(theme);
    expect(result.room!.hud!.playerBar.boText).toBe("");
    expect(titleOf(result).text).toBe("周末邀请赛");
    expect(result.room!.textBoxes.find((box) => box.id === "sponsor"))
      .toEqual(project.room!.textBoxes.find((box) => box.id === "sponsor"));
    expect(result.teams).toEqual(project.teams);
    expect(result.style.teamLayout).toEqual(project.style.teamLayout);
  });

  it.each(["", "   "])("keeps an intentionally empty match format %j through normalization", (boText) => {
    const room = createDefaultRoomDesign();
    room.hud!.playerBar.boText = boText;
    expect(normalizeRoomDesign(normalizeRoomDesign(room)).hud!.playerBar.boText).toBe("");
  });

  it("does not label independently mixed visuals as a complete season theme", () => {
    const project = createDefaultRosterProject();
    project.room!.hud!.playerBar.preset = "s3-clover-hinge";
    expect(getAppliedSeasonTheme(project)).toBeUndefined();
  });

  it("keeps free layout mode and custom text when a season is applied", () => {
    const project = customizedProject();
    project.room!.mode = "free";
    const result = jsonRoundTrip(applySeasonTheme(project, "s3"));
    expect(result.room!.mode).toBe("free");
    expect(result.room!.textBoxes.map((box) => [box.id, box.text]))
      .toEqual(project.room!.textBoxes.map((box) => [box.id, box.text]));
  });
});


describe("HUD text appearance overrides", () => {
  it.each(["player-left", "player-right", "score-left", "score-right"] as const)(
    "preserves the unedited S4 %s appearance without rewriting legacy values",
    (role) => {
      const project = createDefaultRosterProject();
      const box = project.room!.textBoxes.find((item) => item.role === role)!;
      const before = structuredClone(box);
      const appearance = resolveRoomHudTextAppearance(box, "s4-moon-relic");
      expect(appearance.color).toBe(role.startsWith("score") ? "#fff7df" : "#214759");
      expect(appearance.fontFamily).toBe(role.startsWith("score") ? '"Arial Black", "MiSans", sans-serif' : '"MiSans", sans-serif');
      expect(box).toEqual(before);
    }
  );

  it.each(["player-left", "player-right", "score-left", "score-right"] as const)(
    "retains explicitly selected legacy defaults for %s through preset transfer",
    (role) => {
      const project = createDefaultRosterProject();
      const box = project.room!.textBoxes.find((item) => item.role === role)!;
      box.hudFontOverride = true;
      box.hudColorOverride = true;
      const imported = jsonRoundTrip(project);
      const actual = imported.room!.textBoxes.find((item) => item.role === role)!;
      expect(actual.hudColorOverride).toBe(true);
      expect(actual.hudFontOverride).toBe(true);
      expect(resolveRoomHudTextAppearance(actual, "s4-moon-relic")).toEqual({
        color: role.endsWith("left") ? "#e42732" : "#2458e8",
        fontFamily: genshinFontFamily
      });
    }
  );

  it("does not let legacy visual migration replace explicitly edited color and font", () => {
    const project = createDefaultRosterProject();
    const box = project.room!.textBoxes.find((item) => item.role === "score-left")!;
    Object.assign(box, { color: "#e73735", fontFamily: "Arial", hudColorOverride: true, hudFontOverride: true });
    const imported = jsonRoundTrip(project);
    expect(imported.room!.textBoxes.find((item) => item.role === "score-left"))
      .toMatchObject({ color: "#e73735", fontFamily: "Arial", hudColorOverride: true, hudFontOverride: true });
  });
});


it("switches builtin season artwork while preserving title mode and customized geometry", () => {
  let project = createDefaultRosterProject();
  expect(project.room!.hud!.titleImage.imagePath).toBe("builtin:s4-moon-reverie-title");
  project.room!.hud!.titleImage.visible = true;
  const title = { ...titleOf(project), text: "月下邀请赛", color: "#cdefab", fontSize: 80 };
  project.room!.textBoxes[0] = title;
  project.room!.hud!.titleImage.x = 333;
  project = applySeasonTheme(project, "s3");
  expect(project.room!.hud!.titleImage).toMatchObject({ visible: true, imagePath: "builtin:rock-league-title-v1", x: 333 });
  project = applySeasonTheme(project, "s4");
  expect(project.room!.hud!.titleImage).toMatchObject({ visible: true, imagePath: "builtin:s4-moon-reverie-title", x: 333 });
  expect(titleOf(project)).toMatchObject({ text: "月下邀请赛", fontSize: 80 });
  expect(jsonRoundTrip(project).room!.hud!.titleImage).toEqual(project.room!.hud!.titleImage);
});


it.each(["moon-ring", "star-pennant", "moon-window"] as const)("preserves S4 %s through JSON transfer and season changes", (s4CardPlate) => {
  const project = createDefaultRosterProject();
  project.style.s4CardPlate = s4CardPlate;
  project.style.cardPlateScale = 1.12;
  project.style.cardPlateYOffset = 9;
  const restored = jsonRoundTrip(applySeasonTheme(applySeasonTheme(project, "s3"), "s4"));
  expect(restored.style).toMatchObject({ s4CardPlate, cardPlateScale: 1.12, cardPlateYOffset: 9 });
});

it("uses A for missing or invalid S4 plate selection", () => {
  expect(normalizeRosterStyle({ cloudTheme: "s4" }).s4CardPlate).toBe("moon-ring");
  expect(normalizeRosterStyle({ s4CardPlate: "unknown" } as any).s4CardPlate).toBe("moon-ring");
});
