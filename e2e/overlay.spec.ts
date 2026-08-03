import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import type { ResolvedRosterProject } from "../src/types";
import { createDefaultRoomDesign } from "../src/core/room";

const art = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="${color}"/></svg>`
  )}`;

const tallArt = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 260"><path d="M60 6 C100 54 100 190 60 254 C20 190 20 54 60 6Z" fill="${color}"/></svg>`
  )}`;

const resolved: ResolvedRosterProject = {
  id: "default",
  name: "默认项目",
  style: {
    resolution: { width: 1920, height: 1080 },
    cardGap: 14,
    imageScale: 1,
    cardBackground: "transparent",
    showElementIcon: true
  },
  assets: [],
  missingNames: { left: [], right: [] },
  teams: {
    left: {
      label: "左队",
      slots: ["化蝶", "岚鸟", "海豹船长", "圆号鱼", "蹦床松鼠", "霹雳迪迪"].map(
        (name, index) => ({
          name,
          assetId: `left-${index}`,
          formAssetId: `left-${index}`,
          defeated: false,
          health: { percent: 100, visible: true, source: "manual" as const },
          asset: {
            id: `left-${index}`,
            name,
            aliases: [],
            element: ["虫/萌", "翼", "武/水", "水", "普通", "电/光"][index],
            imagePath: art(["#76af37", "#6f88d8", "#d0733d", "#45aae5", "#8f99a8", "#f7d248"][index]),
            updatedAt: "now"
          },
          resolvedElement: ["虫/萌", "翼", "武/水", "水", "普通", "电/光"][index],
          formOptions: []
        })
      )
    },
    right: {
      label: "右队",
      slots: ["巨鼓象", "雪影娃娃", "霹雳迪迪", "海枝枝（碧蓝珊瑚）", "蹦床松鼠", "泥吼牙"].map(
        (name, index) => ({
          name,
          assetId: `right-${index}`,
          formAssetId: `right-${index}`,
          defeated: false,
          health: { percent: 100, visible: true, source: "manual" as const },
          asset: {
            id: `right-${index}`,
            name,
            aliases: [],
            element: ["机械", "冰/萌", "电/光", "水/幽", "普通", "地/翼"][index],
            imagePath: art(["#7e92a7", "#6dc7ed", "#f7d248", "#45aae5", "#8f99a8", "#ba895a"][index]),
            updatedAt: "now"
          },
          resolvedElement: ["机械", "冰/萌", "电/光", "水/幽", "普通", "地/翼"][index],
          formOptions: []
        })
      )
    }
  }
};

function meanEdgeRgbDiff(a: PNG, b: PNG, edgeBand: number): number {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);

  let total = 0;
  let count = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      if (x >= edgeBand && x < a.width - edgeBand && y >= edgeBand && y < a.height - edgeBand) {
        continue;
      }
      const index = (y * a.width + x) * 4;
      total +=
        Math.abs(a.data[index] - b.data[index]) +
        Math.abs(a.data[index + 1] - b.data[index + 1]) +
        Math.abs(a.data[index + 2] - b.data[index + 2]);
      count += 3;
    }
  }
  return count > 0 ? total / count : 0;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(resolved)
    });
  });
});

test("OBS overlay uses server-sent events without steady two-second polling", async ({ page }) => {
  await page.addInitScript(() => {
    class MockEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = MockEventSource.OPEN;
      private listeners = new Map<string, Array<(event: Event) => void>>();

      constructor() {
        window.setTimeout(() => this.dispatch("open"), 0);
      }

      addEventListener(type: string, listener: (event: Event) => void) {
        const current = this.listeners.get(type) ?? [];
        current.push(listener);
        this.listeners.set(type, current);
      }

      removeEventListener(type: string, listener: (event: Event) => void) {
        this.listeners.set(
          type,
          (this.listeners.get(type) ?? []).filter((item) => item !== listener)
        );
      }

      close() {
        this.readyState = MockEventSource.CLOSED;
      }

      private dispatch(type: string) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(new Event(type));
        }
      }
    }

    (window as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
  });

  let stateRequests = 0;
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    stateRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(resolved)
    });
  });

  await page.goto("/overlay/default?mode=overlay");
  await expect(page.getByTestId("roster-card")).toHaveCount(12);
  const requestsAfterInitialRender = stateRequests;
  await page.waitForTimeout(2500);

  expect(stateRequests).toBe(requestsAfterInitialRender);
});

test("OBS overlay renders both teams with twelve complete cards", async ({ page }) => {
  await page.goto("/overlay/default?mode=overlay");

  await expect(page.getByTestId("roster-card")).toHaveCount(12);
  await expect(page.getByText("化蝶")).toBeVisible();
  await expect(page.getByText("泥吼牙")).toBeVisible();
  await expect(page.locator(".team-rail-right .pet-name").nth(3)).toHaveText("海枝枝");
  await expect(page.getByText("海枝枝（碧蓝珊瑚）")).toHaveCount(0);
  await expect(page.locator(".element-badges[aria-label='属性：虫/萌']")).toBeVisible();
  await expect(page.locator(".element-badges[aria-label='属性：电/光']")).toHaveCount(2);
});

test("room mode renders the decorated live room without changing roster data", async ({ page }) => {
  await page.goto("/overlay/default?mode=room");

  await expect(page.getByTestId("room-scene")).toBeVisible();
  await expect(page.locator(".room-background-image")).toHaveCount(1);
  await expect(page.locator(".room-text-title")).toContainText("S3·铅字幻梦");
  await expect(page.locator(".room-text-player-left")).toContainText("左");
  await expect(page.locator(".room-text-player-right")).toContainText("右");
  await expect(page.locator(".room-text-title")).toBeVisible();
  await expect(page.locator(".room-text-player-left")).toBeHidden();
  await expect(page.locator(".room-text-player-right")).toBeHidden();
  await expect(page.getByTestId("roster-card")).toHaveCount(12);
});

test("room mode renders the reference broadcast HUD chrome with a bottom player bar", async ({ page }) => {
  const room = createDefaultRoomDesign();
  room.hud!.titleImage.visible = true;
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...resolved, room })
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overlay/default?mode=room");

  await expect(page.locator(".room-broadcast-title")).toBeVisible();
  await expect(page.locator(".room-player-bar")).toBeVisible();
  await expect(page.locator(".room-player-side-left")).toBeVisible();
  await expect(page.locator(".room-player-side-right")).toBeVisible();
  await expect(page.locator(".room-score-pill")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const playerBar = document.querySelector(".room-player-bar")?.getBoundingClientRect();
    const scorePill = document.querySelector(".room-score-pill")?.getBoundingClientRect();
    const titleImage = document.querySelector(".room-broadcast-title img")?.getBoundingClientRect();
    const playerBarStyle = playerBar
      ? getComputedStyle(document.querySelector(".room-player-bar") as HTMLElement)
      : undefined;
    const scorePillStyle = scorePill
      ? getComputedStyle(document.querySelector(".room-score-pill") as HTMLElement)
      : undefined;
    const leftCards = [...document.querySelectorAll(".team-rail-left .roster-card")].map((node) =>
      node.getBoundingClientRect()
    );
    const rightCards = [...document.querySelectorAll(".team-rail-right .roster-card")].map((node) =>
      node.getBoundingClientRect()
    );
    const allCards = [...leftCards, ...rightCards];
    const legacyVisible = [
      ".room-text-title",
      ".room-text-player-left",
      ".room-text-player-right",
      ".room-text-score-left",
      ".room-text-score-right"
    ].some((selector) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node as HTMLElement).display !== "none" : false;
    });
    return {
      playerBar: {
        x: playerBar?.x ?? 0,
        y: playerBar?.y ?? 0,
        width: playerBar?.width ?? 0,
        height: playerBar?.height ?? 0,
        radius: Number.parseFloat(playerBarStyle?.borderTopLeftRadius ?? "0")
      },
      scorePill: {
        height: scorePill?.height ?? 0,
        width: scorePill?.width ?? 0,
        radius: Number.parseFloat(scorePillStyle?.borderTopLeftRadius ?? "0")
      },
      titleImage: {
        y: titleImage?.y ?? 0,
        width: titleImage?.width ?? 0,
        height: titleImage?.height ?? 0
      },
      playerBarArtWidth:
        (document.querySelector(".room-player-bar-art") as HTMLImageElement | null)?.naturalWidth ?? 0,
      avatarSlotCount: document.querySelectorAll(".room-player-avatar-slot").length,
      leftCardX: leftCards.map((rect) => Math.round(rect.x)),
      rightCardX: rightCards.map((rect) => Math.round(rect.x)),
      minCardTop: Math.min(...allCards.map((rect) => rect.top)),
      maxCardBottom: Math.max(...allCards.map((rect) => rect.bottom)),
      leftSafeRight: Math.max(...leftCards.map((rect) => rect.right)),
      rightSafeLeft: Math.min(...rightCards.map((rect) => rect.left)),
      legacyVisible
    };
  });

  expect(geometry.legacyVisible).toBe(false);
  expect(geometry.titleImage.y).toBeLessThan(60);
  expect(geometry.titleImage.width).toBeGreaterThan(300);
  expect(geometry.titleImage.width).toBeLessThan(430);
  expect(geometry.titleImage.height).toBeGreaterThan(96);
  expect(geometry.titleImage.height).toBeLessThan(130);
  expect(geometry.playerBar.y).toBeGreaterThan(908);
  expect(geometry.playerBar.y).toBeLessThan(920);
  expect(geometry.playerBar.width).toBeGreaterThan(1480);
  expect(geometry.playerBar.width).toBeLessThan(1510);
  expect(geometry.playerBar.height).toBeGreaterThanOrEqual(144);
  expect(geometry.playerBar.height).toBeLessThanOrEqual(152);
  expect(geometry.playerBar.radius).toBe(0);
  expect(geometry.scorePill.width).toBeGreaterThan(420);
  expect(geometry.scorePill.width).toBeLessThan(450);
  expect(geometry.scorePill.height).toBeGreaterThan(144);
  expect(geometry.scorePill.radius).toBe(0);
  expect(geometry.playerBarArtWidth).toBeGreaterThan(1000);
  expect(geometry.avatarSlotCount).toBe(0);
  expect(new Set(geometry.leftCardX).size).toBeGreaterThan(2);
  expect(new Set(geometry.rightCardX).size).toBeGreaterThan(2);
  expect(geometry.minCardTop).toBeGreaterThan(100);
  expect(geometry.maxCardBottom).toBeLessThan(geometry.playerBar.y - 28);
  expect(geometry.leftSafeRight).toBeLessThan(310);
  expect(geometry.rightSafeLeft).toBeGreaterThan(1610);
});

test("room player bar supports the enabled live scoreboard presets", async ({ page }) => {
  const variants = [
    {
      preset: "s3-storybook",
      expectedClass: "room-player-bar-preset-s3-storybook",
      minHeight: 144,
      maxHeight: 152,
      sideScores: 0,
      centralScores: 2
    },
    {
      preset: "s3-prism-bookmark",
      expectedClass: "room-player-bar-preset-s3-prism-bookmark",
      minHeight: 128,
      maxHeight: 136,
      sideScores: 0,
      centralScores: 2
    },
    {
      preset: "s3-clover-hinge",
      expectedClass: "room-player-bar-preset-s3-clover-hinge",
      minHeight: 144,
      maxHeight: 152,
      sideScores: 0,
      centralScores: 2
    },
    {
      preset: "classic",
      expectedClass: "room-player-bar-preset-classic",
      minHeight: 96,
      maxHeight: 116,
      sideScores: 0,
      centralScores: 2
    },
    {
      preset: "compact",
      expectedClass: "room-player-bar-preset-compact",
      minHeight: 70,
      maxHeight: 90,
      sideScores: 0,
      centralScores: 2
    },
    {
      preset: "player-score",
      expectedClass: "room-player-bar-preset-player-score",
      minHeight: 88,
      maxHeight: 106,
      sideScores: 2,
      centralScores: 0
    }
  ] as const;

  for (const variant of variants) {
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          room: {
            mode: "competition",
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
                preset: variant.preset,
                boText: "BO5",
                widthScale: 0.9,
                textScale: 1.4,
                leftAvatarPath: "builtin:player-avatar-blue",
                rightAvatarPath: "builtin:player-avatar-bunny",
                avatarVisible: true,
                animation: true
              }
            },
            textBoxes: [
              { id: "room-player-left", role: "player-left", text: "左侧选手" },
              { id: "room-player-right", role: "player-right", text: "右侧选手" },
              { id: "room-score-left", role: "score-left", text: "9" },
              { id: "room-score-right", role: "score-right", text: "1" }
            ]
          }
        })
      });
    });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/overlay/default?mode=room&preset=${variant.preset}`);
    const playerBar = page.locator(".room-player-bar");
    await expect(playerBar).toHaveClass(new RegExp(variant.expectedClass));
    await expect(page.locator(".room-score-format")).toHaveText("BO5");
    await expect(page.locator(".room-player-avatar-slot")).toHaveCount(2);
    await expect(page.locator(".room-player-side-score:not(.room-player-side-score-hidden)")).toHaveCount(
      variant.sideScores
    );
    await expect(page.locator(".room-score-pill .room-score-value")).toHaveCount(variant.centralScores);

    const geometry = await page.evaluate(() => {
      const bar = document.querySelector(".room-player-bar")?.getBoundingClientRect();
      const scorePill = document.querySelector(".room-score-pill")?.getBoundingClientRect();
      const leftScore = document.querySelector(".room-score-value-left");
      const rightScore = document.querySelector(".room-score-value-right");
      const sideScores = [...document.querySelectorAll(".room-player-side-score")].map((node) =>
        node.getBoundingClientRect()
      );
      const leftName = document.querySelector(".room-player-side-left .room-player-name")?.getBoundingClientRect();
      const rightName = document.querySelector(".room-player-side-right .room-player-name")?.getBoundingClientRect();
      const leftAvatar = document.querySelector(".room-player-side-left .room-player-avatar-slot")?.getBoundingClientRect();
      const rightAvatar = document.querySelector(".room-player-side-right .room-player-avatar-slot")?.getBoundingClientRect();
      const name = document.querySelector(".room-player-name");
      const score =
        document.querySelector(".room-score-value") ??
        document.querySelector(".room-player-side-score:not(.room-player-side-score-hidden)");
      const separator = document.querySelector(".room-score-separator");
      const format = document.querySelector(".room-score-format");
      const separatorRect = separator?.getBoundingClientRect();
      const formatRect = format?.getBoundingClientRect();
      const textCenter = (node: Element | null) => {
        if (!node) return 0;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return (rect.left + rect.right) / 2;
      };
      const barStyle = bar ? getComputedStyle(document.querySelector(".room-player-bar") as HTMLElement) : undefined;
      const scorePillStyle = scorePill
        ? getComputedStyle(document.querySelector(".room-score-pill") as HTMLElement)
        : undefined;
      return {
        barLeft: bar?.left ?? 0,
        barRight: bar?.right ?? 0,
        barHeight: bar?.height ?? 0,
        barBottom: bar?.bottom ?? 0,
        barTop: bar?.top ?? 0,
        scorePillLeft: scorePill?.left ?? 0,
        scorePillRight: scorePill?.right ?? 0,
        scorePillWidth: scorePill?.width ?? 0,
        scorePillTop: scorePill?.top ?? 0,
        leftScoreLeft: leftScore?.getBoundingClientRect().left ?? 0,
        rightScoreRight: rightScore?.getBoundingClientRect().right ?? 0,
        leftScoreBackground: leftScore ? getComputedStyle(leftScore).backgroundImage : "",
        rightScoreBackground: rightScore ? getComputedStyle(rightScore).backgroundImage : "",
        scorePillBackground: scorePillStyle?.backgroundColor ?? "",
        scorePillBackgroundImage: scorePillStyle?.backgroundImage ?? "",
        leftAccent: barStyle?.getPropertyValue("--room-left-accent").trim() ?? "",
        rightAccent: barStyle?.getPropertyValue("--room-right-accent").trim() ?? "",
        sideScoreCount: sideScores.filter((rect) => rect.width > 0 && rect.height > 0).length,
        leftScoreRight: sideScores[0]?.right ?? 0,
        leftNameRight: leftName?.right ?? 0,
        rightScoreLeft: sideScores[1]?.left ?? 0,
        rightNameLeft: rightName?.left ?? 0,
        leftAvatarTop: leftAvatar?.top ?? 0,
        rightAvatarTop: rightAvatar?.top ?? 0,
        nameFontSize: name ? Number.parseFloat(getComputedStyle(name).fontSize) : 0,
        scoreFontSize: score ? Number.parseFloat(getComputedStyle(score).fontSize) : 0,
        separatorFontSize: separator ? Number.parseFloat(getComputedStyle(separator).fontSize) : 0,
        formatFontSize: format ? Number.parseFloat(getComputedStyle(format).fontSize) : 0,
        separatorWidth: separatorRect?.width ?? 0,
        formatWidth: formatRect?.width ?? 0,
        separatorTextOffset: separatorRect ? textCenter(separator) - (separatorRect.left + separatorRect.right) / 2 : 0,
        formatTextOffset: formatRect ? textCenter(format) - (formatRect.left + formatRect.right) / 2 : 0,
        centerLabelGap: (formatRect?.top ?? 0) - (separatorRect?.bottom ?? 0),
        centerLabelMiddle:
          separatorRect && formatRect ? (separatorRect.top + formatRect.bottom) / 2 : 0,
        scorePillMiddle: scorePill ? (scorePill.top + scorePill.bottom) / 2 : 0,
        artNaturalWidth: (document.querySelector(".room-player-bar-art") as HTMLImageElement | null)?.naturalWidth ?? 0,
        artSource: (document.querySelector(".room-player-bar-art") as HTMLImageElement | null)?.currentSrc ?? ""
      };
    });

    expect(geometry.barHeight).toBeGreaterThanOrEqual(variant.minHeight);
    expect(geometry.barHeight).toBeLessThanOrEqual(variant.maxHeight);
    const expectedWidthRatio = variant.preset === "classic" || variant.preset === "compact" ? 0.594 : 0.702;
    expect((geometry.barRight - geometry.barLeft) / 1920).toBeCloseTo(expectedWidthRatio, 2);
    expect(geometry.nameFontSize).toBeGreaterThan(variant.preset === "compact" ? 32 : 40);
    expect(geometry.scoreFontSize).toBeGreaterThan(variant.preset === "compact" ? 54 : 58);
    expect(geometry.barBottom).toBeLessThanOrEqual(variant.preset.startsWith("s3-") ? 1070 : 1080 - 40);
    if (variant.preset === "player-score") {
      expect(geometry.scorePillWidth).toBeLessThan(130);
      expect(geometry.sideScoreCount).toBe(2);
      expect(geometry.leftScoreRight).toBeGreaterThan(geometry.leftNameRight);
      expect(geometry.rightScoreLeft).toBeLessThan(geometry.rightNameLeft);
    }
    if (variant.preset === "classic") {
      expect(geometry.leftAccent).toContain("242");
      expect(geometry.rightAccent).toContain("91");
      expect(geometry.scorePillBackground).toBe("rgba(0, 0, 0, 0)");
      expect(geometry.scorePillBackgroundImage).toBe("none");
      expect(geometry.leftScoreBackground).not.toBe(geometry.rightScoreBackground);
    }
    if (variant.preset.startsWith("s3-")) {
      expect(geometry.artNaturalWidth).toBeGreaterThan(1000);
      expect(geometry.separatorFontSize).toBeGreaterThanOrEqual(36);
      expect(geometry.formatFontSize).toBeGreaterThanOrEqual(24);
      expect(geometry.separatorFontSize).toBeLessThan(50);
      expect(Math.abs(geometry.separatorWidth - geometry.formatWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.separatorTextOffset)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.formatTextOffset)).toBeLessThanOrEqual(1);
      expect(geometry.centerLabelGap).toBeGreaterThanOrEqual(2);
      expect(geometry.centerLabelGap).toBeLessThanOrEqual(10);
      expect(Math.abs(geometry.centerLabelMiddle - geometry.scorePillMiddle)).toBeLessThanOrEqual(6);
    }
    if (variant.preset === "s3-prism-bookmark") {
      expect(geometry.leftScoreLeft).toBeLessThan(geometry.barLeft + 40);
      expect(geometry.rightScoreRight).toBeGreaterThan(geometry.barRight - 40);
    }
    if (variant.preset === "s3-clover-hinge") {
      expect(geometry.artSource).toContain("s3-clover-hinge-wide.png");
      expect(geometry.separatorWidth / geometry.scorePillWidth).toBeCloseTo(0.25, 2);
    }
  }
});

test("captures the three S3 player bar presets on a transparent surface", async ({ page }) => {
  const presets = ["s3-storybook", "s3-prism-bookmark", "s3-clover-hinge"] as const;

  for (const preset of presets) {
    const room = createDefaultRoomDesign();
    room.hud!.playerBar.preset = preset;
    room.hud!.playerBar.avatarVisible = false;
    const leftScore = room.textBoxes.find((box) => box.role === "score-left");
    const rightScore = room.textBoxes.find((box) => box.role === "score-right");
    if (leftScore) leftScore.text = "9";
    if (rightScore) rightScore.text = "1";

    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...resolved, room })
      });
    });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/overlay/default?mode=room&preset=${preset}`);
    const playerBar = page.locator(".room-player-bar");
    const artImage = playerBar.locator(".room-player-bar-art");
    await expect(artImage).toBeVisible();
    await expect.poll(() => artImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(1000);
    if (preset === "s3-clover-hinge") {
      await page.screenshot({
        path: "output/playwright/s3-clover-hinge-room.png",
        animations: "disabled"
      });
    }
    await page.addStyleTag({
      content: `
        html, body, #root, .room-scene { background: transparent !important; }
        .room-background-image, .room-background-edge-blur, .room-background-dim, .room-overlay-layer { display: none !important; }
      `
    });
    await playerBar.screenshot({
      path: `output/playwright/${preset}-implementation.png`,
      omitBackground: true,
      animations: "disabled"
    });

    if (preset === "s3-clover-hinge") {
      room.hud!.playerBar.avatarVisible = true;
      room.hud!.playerBar.leftAvatarPath = "builtin:player-avatar-blue";
      room.hud!.playerBar.rightAvatarPath = "builtin:player-avatar-bunny";
      await page.reload();
      await expect(page.locator(".room-player-avatar-slot")).toHaveCount(2);
      await page.addStyleTag({
        content: `
          html, body, #root, .room-scene { background: transparent !important; }
          .room-background-image, .room-background-edge-blur, .room-background-dim, .room-overlay-layer { display: none !important; }
        `
      });
      await page.locator(".room-player-bar").screenshot({
        path: "output/playwright/s3-clover-hinge-avatar-visible.png",
        omitBackground: true,
        animations: "disabled"
      });
    }
  }
});

test("S3 player bars preserve their proportions across output resolutions", async ({ page }) => {
  const sizes = [
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 }
  ];

  for (const size of sizes) {
    const room = createDefaultRoomDesign();
    room.hud!.playerBar.preset = "s3-clover-hinge";
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          style: { ...resolved.style, resolution: size },
          room
        })
      });
    });

    await page.setViewportSize(size);
    await page.goto("/overlay/default?mode=room&preset=s3-clover-hinge");
    const geometry = await page.locator(".room-player-bar").evaluate((bar) => {
      const rect = bar.getBoundingClientRect();
      const name = bar.querySelector(".room-player-name");
      return {
        width: rect.width,
        height: rect.height,
        bottom: window.innerHeight - rect.bottom,
        nameFontSize: name ? Number.parseFloat(getComputedStyle(name).fontSize) : 0
      };
    });

    expect(geometry.width / size.width).toBeCloseTo(0.78, 2);
    expect(geometry.height / size.height).toBeCloseTo(148 / 1080, 2);
    expect(geometry.bottom / size.height).toBeCloseTo(18 / 1080, 2);
    expect(geometry.nameFontSize / size.height).toBeCloseTo(42 / 1080, 2);
  }
});

test("room mode supports imported title images and animated player slot visibility", async ({ page }) => {
  const titleImage =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 150"><rect width="500" height="150" rx="42" fill="#f48b2b"/><text x="250" y="95" text-anchor="middle" font-size="66" font-family="Arial" font-weight="900" fill="#321506">ROCO CUP</text></svg>`
    );

  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        room: {
          mode: "competition",
          hud: {
            titleImage: {
              visible: true,
              imagePath: titleImage,
              fit: "contain",
              opacity: 0.88
            },
            playerBar: {
              visible: true,
              leftVisible: false,
              rightVisible: true,
              scoreVisible: true,
              boText: "BO7",
              leftAvatarPath: "builtin:player-avatar-blue",
              rightAvatarPath: "builtin:player-avatar-bunny",
              animation: true
            }
          }
        }
      })
    });
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overlay/default?mode=room");

  await expect(page.locator(".room-broadcast-title img")).toHaveAttribute("src", titleImage);
  await expect(page.locator(".room-score-format")).toHaveText("BO7");
  await expect(page.locator(".room-player-side-left")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".room-player-side-right")).toHaveAttribute("aria-hidden", "false");

  const state = await page.locator(".room-player-side-left").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      opacity: style.opacity,
      transform: style.transform,
      transition: style.transitionProperty
    };
  });

  expect(Number(state.opacity)).toBeLessThan(0.1);
  expect(state.transform).not.toBe("none");
  expect(state.transition).toContain("opacity");
});

test("room text font stroke switch disables the rendered stroke", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        room: {
          mode: "competition",
          textBoxes: [
            {
              id: "room-title",
              role: "title",
              text: "S3·铅字幻梦",
              x: 500,
              y: 20,
              width: 920,
              height: 108,
              fontFamily: "MiSans",
              fontSize: 90,
              fontWeight: 930,
              color: "#ffdc4a",
              strokeEnabled: false,
              strokeColor: "#ffffff",
              strokeWidth: 2.2,
              shadowColor: "rgba(118, 74, 0, 0.58)",
              background: "transparent",
              backgroundOpacity: 0,
              borderColor: "transparent",
              borderWidth: 0,
              radius: 0,
              align: "center",
              opacity: 1
            }
          ]
        }
      })
    });
  });

  await page.goto("/overlay/default?mode=room");
  await expect(page.locator(".room-text-title")).toContainText("S3·铅字幻梦");
  const renderedStroke = await page.locator(".room-text-title").evaluate((node) => {
    const boxStyle = getComputedStyle(node);
    const textStyle = getComputedStyle(node.querySelector("span") as HTMLElement);
    return {
      strokeWidth: boxStyle.getPropertyValue("--room-text-stroke").trim(),
      strokeColor: boxStyle.getPropertyValue("--room-text-stroke-color").trim(),
      webkitTextStroke: textStyle.getPropertyValue("-webkit-text-stroke"),
      textShadow: textStyle.textShadow
    };
  });
  expect(renderedStroke.strokeWidth).toBe("0px");
  expect(renderedStroke.strokeColor).toBe("transparent");
  expect(renderedStroke.webkitTextStroke).toContain("0px");
  expect(renderedStroke.textShadow).not.toContain("rgb(255, 255, 255)");
});

test("room mode default seasonal title renders with its green contour and clipped texture", async ({ page }) => {
  await page.goto("/overlay/default?mode=room");
  await expect(page.locator(".room-text-title")).toContainText("S3·铅字幻梦");
  const renderedStroke = await page.locator(".room-text-title").evaluate((node) => {
    const boxStyle = getComputedStyle(node);
    const textNode = node.querySelector("span") as HTMLElement;
    const textStyle = getComputedStyle(textNode);
    const baseLayer = getComputedStyle(textNode, "::before");
    const accentLayer = getComputedStyle(textNode, "::after");
    return {
      layerText: textNode.dataset.text,
      strokeWidth: boxStyle.getPropertyValue("--room-text-stroke").trim(),
      strokeColor: boxStyle.getPropertyValue("--room-text-stroke-color").trim(),
      webkitTextStroke: textStyle.getPropertyValue("-webkit-text-stroke"),
      textShadow: textStyle.textShadow,
      baseColor: baseLayer.color,
      baseStrokeWidth: baseLayer.getPropertyValue("-webkit-text-stroke-width"),
      baseStrokeColor: baseLayer.getPropertyValue("-webkit-text-stroke-color"),
      accentBackgroundImage: accentLayer.backgroundImage,
      accentOpacity: Number.parseFloat(accentLayer.opacity)
    };
  });
  expect(renderedStroke.layerText).toBe("S3·铅字幻梦");
  expect(renderedStroke.strokeWidth).toBe("1px");
  expect(renderedStroke.strokeColor).toBe("#527f57");
  expect(Number.parseFloat(renderedStroke.baseStrokeWidth)).toBeGreaterThanOrEqual(2.5);
  expect(renderedStroke.baseStrokeColor).toBe("rgb(82, 127, 87)");
  expect(renderedStroke.baseColor).toBe("rgb(219, 234, 155)");
  expect(renderedStroke.accentBackgroundImage).toContain("s3-clover-colored-pencil-fill");
  expect(renderedStroke.accentOpacity).toBeGreaterThan(0.7);
  expect(renderedStroke.accentOpacity).toBeLessThanOrEqual(1);

  await page.locator(".room-text-title").evaluate((node) => {
    (node as HTMLElement).style.setProperty("--room-text-fill-color", "#f4c6d8");
  });
  await expect
    .poll(() =>
      page.locator(".room-text-title span").evaluate((node) => getComputedStyle(node, "::before").color)
    )
    .toBe("rgb(244, 198, 216)");
});

test("room mode can show OBS alignment guides", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        room: {
          mode: "competition",
          guides: { visible: true, mode: "safe" }
        }
      })
    });
  });

  await page.goto("/overlay/default?mode=room");

  await expect(page.locator(".room-guide-layer")).toBeVisible();
  await expect(page.locator(".room-guide-line-x")).toBeVisible();
  await expect(page.locator(".room-guide-line-y")).toBeVisible();
  await expect(page.locator(".room-guide-safe-frame")).toBeVisible();
  await expect(page.locator(".room-guide-label-center")).toContainText("960");
});

test("room background edge blur covers both 1080p and 1440p output sizes", async ({ page }) => {
  for (const resolution of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 }
  ]) {
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          style: {
            ...resolved.style,
            resolution
          },
          room: {
            mode: "competition",
            background: {
              visible: true,
              imagePath: "builtin:world-room-v3",
              fit: "cover",
              opacity: 1,
              dim: 0.12,
              edgeBlur: 36
            }
          }
        })
      });
    });

    await page.setViewportSize({ width: Math.round(resolution.width / 2), height: Math.round(resolution.height / 2) });
    await page.goto("/overlay/default?mode=room");
    await expect(page.locator(".room-background-edge-blur")).toBeVisible();

    const geometry = await page.locator("[data-testid='room-scene']").evaluate((scene) => {
      const blur = scene.querySelector(".room-background-edge-blur");
      const sceneStyle = getComputedStyle(scene);
      const blurStyle = blur ? getComputedStyle(blur) : undefined;
      return {
        sceneWidth: sceneStyle.width,
        sceneHeight: sceneStyle.height,
        blurWidth: blurStyle?.width,
        blurHeight: blurStyle?.height,
        filter: blurStyle?.filter
      };
    });

    expect(geometry).toMatchObject({
      sceneWidth: `${resolution.width}px`,
      sceneHeight: `${resolution.height}px`,
      blurWidth: `${resolution.width}px`,
      blurHeight: `${resolution.height}px`
    });
    expect(geometry.filter).toContain("blur(48.6px)");
  }
});

test("room background edge blur visibly changes the rendered edge pixels", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });

  async function captureBackground(edgeBlur: number) {
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          teams: {
            left: { label: "left", slots: [] },
            right: { label: "right", slots: [] }
          },
          room: {
            mode: "free",
            background: {
              visible: true,
              imagePath: "builtin:world-room-v3",
              fit: "cover",
              opacity: 1,
              dim: 0,
              edgeBlur
            },
            textBoxes: [
              {
                id: "visual-probe",
                role: "custom",
                text: "",
                x: 0,
                y: 0,
                width: 80,
                height: 34,
                fontFamily: "MiSans",
                fontSize: 12,
                fontWeight: 500,
                color: "#ffffff",
                strokeEnabled: false,
                strokeColor: "transparent",
                strokeWidth: 0,
                shadowColor: "transparent",
                background: "transparent",
                backgroundOpacity: 0,
                borderColor: "transparent",
                borderWidth: 0,
                radius: 0,
                align: "center",
                opacity: 0
              }
            ],
            guides: { visible: false, mode: "safe" }
          }
        })
      });
    });

    await page.goto(`/overlay/default?mode=room&edgeBlur=${edgeBlur}`);
    await expect(page.locator("[data-testid='room-scene']")).toBeVisible();
    await page.waitForFunction(() =>
      Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)
    );
    return PNG.sync.read(await page.screenshot({ animations: "disabled" }));
  }

  const sharp = await captureBackground(0);
  const soft = await captureBackground(16);
  const medium = await captureBackground(32);
  const strong = await captureBackground(80);
  const softDiff = meanEdgeRgbDiff(sharp, soft, 80);
  const mediumDiff = meanEdgeRgbDiff(sharp, medium, 80);
  const strongDiff = meanEdgeRgbDiff(sharp, strong, 80);

  expect(softDiff).toBeGreaterThan(4);
  expect(mediumDiff).toBeGreaterThan(softDiff + 1);
  expect(strongDiff).toBeGreaterThan(mediumDiff + 2);
});

test("room mode and OBS roster modes share the selected roster preset", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto("/overlay/default?mode=overlay");
  await expect(page.getByTestId("roster-card")).toHaveCount(12);
  await expect(page.locator(".pet-card-plate-cloud")).toHaveCount(0);
  await page.goto("/overlay/default?mode=room");
  await expect(page.getByTestId("roster-card")).toHaveCount(12);
  await expect(page.locator(".pet-card-plate-cloud")).toHaveCount(0);

  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          cardBackground: "cloud",
          cardGap: 8,
          imageScale: 1.08,
          cardPlateScale: 1.2,
          cardPlateYOffset: 16
        }
      })
    });
  });

  async function readPreset(mode: "overlay" | "room" | "left" | "right") {
    await page.goto(`/overlay/default?mode=${mode}`);
    await expect(page.getByTestId("overlay-scene")).toBeVisible();
    return page.getByTestId("overlay-scene").evaluate((scene) => {
      const style = getComputedStyle(scene as HTMLElement);
      return {
        className: scene.className,
        plateCount: scene.querySelectorAll(".pet-card-plate-cloud").length,
        petWidth: style.getPropertyValue("--pet-art-max-width").trim(),
        petHeight: style.getPropertyValue("--pet-art-max-height").trim(),
        plateLift: style.getPropertyValue("--card-plate-lift").trim(),
        plateWidth: style.getPropertyValue("--card-plate-width").trim(),
        plateYOffset: style.getPropertyValue("--card-plate-y-offset").trim(),
        railPadTop: style.getPropertyValue("--team-rail-pad-top").trim(),
        railPadX: style.getPropertyValue("--team-rail-pad-x").trim(),
        railPadBottom: style.getPropertyValue("--team-rail-pad-bottom").trim(),
        railWidth: style.getPropertyValue("--team-rail-width").trim()
      };
    });
  }

  const overlayPreset = await readPreset("overlay");
  const roomPreset = await readPreset("room");
  const leftPreset = await readPreset("left");
  const rightPreset = await readPreset("right");

  expect(overlayPreset.className).toContain("overlay-card-cloud");
  expect(roomPreset.className).toContain("overlay-card-cloud");
  expect(leftPreset.className).toContain("overlay-card-cloud");
  expect(rightPreset.className).toContain("overlay-card-cloud");
  expect(overlayPreset.plateCount).toBe(12);
  expect(roomPreset.plateCount).toBe(12);
  expect(leftPreset.plateCount).toBe(6);
  expect(rightPreset.plateCount).toBe(6);

  const sharedPresetKeys = [
    "petWidth",
    "petHeight",
    "plateLift",
    "plateWidth",
    "plateYOffset",
    "railPadTop",
    "railPadX",
    "railPadBottom",
    "railWidth"
  ] as const;
  const pickSharedVars = (preset: typeof overlayPreset) =>
    Object.fromEntries(sharedPresetKeys.map((key) => [key, preset[key]]));
  const overlayVars = pickSharedVars(overlayPreset);
  for (const preset of [roomPreset, leftPreset, rightPreset]) {
    expect(pickSharedVars(preset)).toEqual(overlayVars);
  }
});

test("roster layout mode switches between curved and v3.2.5 vertical tracks", async ({ page }) => {
  async function routeWithLayout(mode: "curved" | "vertical") {
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          style: {
            ...resolved.style,
            teamLayout: {
              mode,
              centerGap: 1540,
              verticalOffset: 0
            }
          }
        })
      });
    });
  }

  async function readTrack(mode: "overlay" | "room", layout: "curved" | "vertical") {
    await routeWithLayout(layout);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/overlay/default?mode=${mode}`);
    await expect(page.getByTestId("roster-card")).toHaveCount(12);
    await expect(page.getByTestId("overlay-scene")).toHaveAttribute("data-layout-mode", layout);
    return page.evaluate(() => {
      const transformX = (selector: string) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) {
          return 0;
        }
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        return matrix.m41;
      };
      const leftCards = [...document.querySelectorAll(".team-rail-left .roster-card")].map((node) =>
        node.getBoundingClientRect()
      );
      return {
        leftFirstX: transformX(".team-rail-left .roster-card:first-child"),
        rightFirstX: transformX(".team-rail-right .roster-card:first-child"),
        leftTrackSpan: Math.max(...leftCards.map((rect) => rect.left)) - Math.min(...leftCards.map((rect) => rect.left))
      };
    });
  }

  const curved = await readTrack("overlay", "curved");
  const vertical = await readTrack("overlay", "vertical");
  const verticalRoom = await readTrack("room", "vertical");

  expect(curved.leftFirstX).toBeGreaterThan(60);
  expect(curved.rightFirstX).toBeLessThan(-60);
  expect(curved.leftTrackSpan).toBeGreaterThan(vertical.leftTrackSpan + 50);
  expect(vertical.leftFirstX).toBeCloseTo(0, 0);
  expect(vertical.rightFirstX).toBeCloseTo(0, 0);
  expect(verticalRoom.leftFirstX).toBeCloseTo(0, 0);
  expect(verticalRoom.rightFirstX).toBeCloseTo(0, 0);
});

test("curved and v3.2.5 roster presets keep the broadcast safe area at 1080p and 1440p", async ({ page }) => {
  const layouts = ["curved", "vertical"] as const;
  const sizes = [
    { width: 1920, height: 1080, label: "1080p", imageScale: 1.02 },
    { width: 2560, height: 1440, label: "1440p", imageScale: 1.06 }
  ];

  for (const layout of layouts) {
    for (const size of sizes) {
      const room = createDefaultRoomDesign();
      await page.unroute("**/api/state/default").catch(() => undefined);
      await page.route("**/api/state/default", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...resolved,
            style: {
              ...resolved.style,
              resolution: { width: size.width, height: size.height },
              cardGap: 8,
              imageScale: size.imageScale,
              teamLayout: {
                ...(resolved.style.teamLayout ?? {}),
                mode: layout
              }
            },
            room
          })
        });
      });

      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(`/overlay/default?mode=room&layout=${layout}`);
      await expect(page.getByTestId("roster-card")).toHaveCount(12);

      const geometry = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-testid="roster-card"]')].map((node) =>
          node.getBoundingClientRect()
        );
        const playerBar = document.querySelector(".room-player-bar")?.getBoundingClientRect();
        const leftCards = [...document.querySelectorAll(".team-rail-left [data-testid=\"roster-card\"]")].map((node) =>
          node.getBoundingClientRect()
        );
        const rightCards = [...document.querySelectorAll(".team-rail-right [data-testid=\"roster-card\"]")].map((node) =>
          node.getBoundingClientRect()
        );
        return {
          minLeft: Math.min(...cards.map((rect) => rect.left)),
          maxRight: Math.max(...cards.map((rect) => rect.right)),
          minTop: Math.min(...cards.map((rect) => rect.top)),
          maxBottom: Math.max(...cards.map((rect) => rect.bottom)),
          playerBarTop: playerBar?.top ?? 0,
          leftSafeRight: Math.max(...leftCards.map((rect) => rect.right)),
          rightSafeLeft: Math.min(...rightCards.map((rect) => rect.left))
        };
      });

      expect(geometry.minLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.maxRight).toBeLessThanOrEqual(size.width);
      expect(geometry.minTop).toBeGreaterThan(size.height * 0.07);
      expect(geometry.maxBottom).toBeLessThan(geometry.playerBarTop - size.height * 0.015);
      expect(geometry.leftSafeRight).toBeLessThan(size.width * 0.25);
      expect(geometry.rightSafeLeft).toBeGreaterThan(size.width * 0.75);

      await page.screenshot({
        path: `output/playwright/roster-${layout}-${size.label}.png`,
        animations: "disabled"
      });
    }
  }
});

test("transparent OBS live-safe preset scales for 1080p and 1440p", async ({ page }) => {
  for (const resolution of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 }
  ]) {
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          style: {
            ...resolved.style,
            resolution,
            cardBackground: "transparent"
          }
        })
      });
    });

    await page.setViewportSize(resolution);
    await page.goto("/overlay/default?mode=overlay");
    await expect(page.getByTestId("roster-card")).toHaveCount(12);
    await expect(page.locator(".pet-card-plate")).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const leftCards = [...document.querySelectorAll(".team-rail-left .roster-card")].map((node) =>
        node.getBoundingClientRect()
      );
      const rightCards = [...document.querySelectorAll(".team-rail-right .roster-card")].map((node) =>
        node.getBoundingClientRect()
      );
      const allCards = [...leftCards, ...rightCards];
      const leftRail = document.querySelector(".team-rail-left")?.getBoundingClientRect();
      return {
        minCardTop: Math.min(...allCards.map((rect) => rect.top)),
        maxCardBottom: Math.max(...allCards.map((rect) => rect.bottom)),
        leftSafeRight: Math.max(...leftCards.map((rect) => rect.right)),
        rightSafeLeft: Math.min(...rightCards.map((rect) => rect.left)),
        railWidth: leftRail?.width ?? 0
      };
    });

    expect(geometry.minCardTop).toBeGreaterThan(resolution.height * 0.085);
    expect(geometry.maxCardBottom).toBeLessThan(resolution.height * 0.89);
    expect(geometry.leftSafeRight).toBeLessThan(resolution.width * 0.17);
    expect(geometry.rightSafeLeft).toBeGreaterThan(resolution.width * 0.83);
    expect(geometry.railWidth).toBeGreaterThan(resolution.width * 0.13);
    expect(geometry.railWidth).toBeLessThan(resolution.width * 0.14);
  }
});

test("overlay pages scale one fixed output canvas instead of changing label geometry", async ({ page }) => {
  async function readGeometry() {
    await expect(page.getByTestId("roster-card")).toHaveCount(12);
    await page.waitForFunction(() => {
      const scale = document.querySelector(".output-viewport-scale");
      return scale && getComputedStyle(scale).transform !== "none";
    });
    return page.evaluate(() => {
      const frame = document.querySelector(".output-viewport-frame")?.getBoundingClientRect();
      const scale = document.querySelector(".output-viewport-scale");
      const label = document.querySelector(".team-rail-left .pet-name-bar")?.getBoundingClientRect();
      const title = document.querySelector(".room-text-title")?.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(scale ? getComputedStyle(scale).transform : undefined);
      return {
        frame: { width: frame?.width ?? 0, height: frame?.height ?? 0 },
        scale: matrix.a,
        label: {
          x: label?.x ?? 0,
          y: label?.y ?? 0,
          width: label?.width ?? 0,
          height: label?.height ?? 0
        },
        title: {
          x: title?.x ?? 0,
          y: title?.y ?? 0,
          width: title?.width ?? 0,
          height: title?.height ?? 0
        }
      };
    });
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overlay/default?mode=room");
  const full = await readGeometry();

  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("/overlay/default?mode=room");
  const half = await readGeometry();

  expect(half.scale).toBeCloseTo(0.5, 2);
  expect(half.frame.width).toBeCloseTo(960, 0);
  expect(half.frame.height).toBeCloseTo(540, 0);
  expect(half.label.height).toBeCloseTo(full.label.height * 0.5, 0);
  expect(half.label.width).toBeCloseTo(full.label.width * 0.5, 0);
  expect(half.label.x).toBeCloseTo(full.label.x * 0.5, 0);
  expect(half.label.y).toBeCloseTo(full.label.y * 0.5, 0);
  expect(half.title.height).toBeCloseTo(full.title.height * 0.5, 0);
  expect(half.title.width).toBeCloseTo(full.title.width * 0.5, 0);
  expect(half.title.x).toBeCloseTo(full.title.x * 0.5, 0);
  expect(half.title.y).toBeCloseTo(full.title.y * 0.5, 0);
});

test("app preview frames single-team modes with the true narrow capture aspect", async ({ page }) => {
  const assets = [...resolved.teams.left.slots, ...resolved.teams.right.slots]
    .map((slot) => slot.asset)
    .filter(Boolean);
  const project = {
    id: resolved.id,
    name: resolved.name,
    style: {
      ...resolved.style,
      cardBackground: "cloud"
    },
    teams: {
      left: {
        label: resolved.teams.left.label,
        slots: resolved.teams.left.slots.map((slot) => ({
          name: slot.name,
          assetId: slot.assetId,
          formAssetId: slot.formAssetId,
          defeated: slot.defeated
        }))
      },
      right: {
        label: resolved.teams.right.label,
        slots: resolved.teams.right.slots.map((slot) => ({
          name: slot.name,
          assetId: slot.assetId,
          formAssetId: slot.formAssetId,
          defeated: slot.defeated
        }))
      }
    }
  };
  const appState = {
    project,
    projects: [project],
    activeProjectId: project.id,
    assets,
    liveState: { health: {}, updatedAt: "preview-test" },
    dataDir: "C:\\preview-test",
    exportDir: "C:\\preview-test\\exports",
    serverUrl: "http://127.0.0.1:51736"
  };
  await page.addInitScript((state) => {
    (window as any).roster = {
      getState: async () => state,
      saveProject: async (project: unknown) => project,
      activateProject: async () => state.project,
      updateSlotHealth: async () => state.liveState,
      resetHealth: async () => state.liveState,
      exportPng: async () => "",
      revealPath: () => undefined,
      onStateChanged: () => () => undefined,
      onRuntimeCacheChanged: () => () => undefined,
      getRuntimeCacheStatus: async () => undefined,
      clearRuntimeCache: async () => undefined,
      copyText: async () => undefined,
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      openControlWindow: async () => undefined
    };
  }, appState);

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".preview-area")).toBeVisible();

  const previewButtons = page.locator(".preview-switch button");
  await previewButtons.nth(0).click();
  const leftPreview = await page.evaluate(() => {
    const frame = document.querySelector(".preview-output .output-viewport-frame")?.getBoundingClientRect();
    const board = document.querySelector(".preview-board")?.getBoundingClientRect();
    const url = document.querySelector(".preview-status span:last-child")?.textContent ?? "";
    return {
      url,
      frameWidth: frame?.width ?? 0,
      frameHeight: frame?.height ?? 0,
      boardWidth: board?.width ?? 1,
      boardHeight: board?.height ?? 1
    };
  });
  expect(leftPreview.url).toContain("mode=left");
  expect(leftPreview.frameWidth).toBeLessThan(leftPreview.boardWidth * 0.38);
  expect(leftPreview.frameHeight).toBeGreaterThan(leftPreview.boardHeight * 0.9);

  await previewButtons.nth(2).click();
  const overlayPreview = await page.evaluate(() => {
    const frame = document.querySelector(".preview-output .output-viewport-frame")?.getBoundingClientRect();
    const url = document.querySelector(".preview-status span:last-child")?.textContent ?? "";
    return {
      url,
      frameWidth: frame?.width ?? 0,
      frameHeight: frame?.height ?? 0
    };
  });
  expect(overlayPreview.url).toContain("mode=overlay");
  expect(overlayPreview.frameWidth).toBeGreaterThan(leftPreview.frameWidth * 2.5);
  expect(overlayPreview.frameHeight).toBeLessThan(leftPreview.frameHeight);
});

test("single team export mode renders only one six-pet team", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1080 });
  await page.goto("/overlay/default?mode=left");

  await expect(page.getByTestId("roster-card")).toHaveCount(6);
  await expect(page.getByText("左队")).toBeVisible();
  await expect(page.getByText("右队")).toHaveCount(0);
  for (const name of ["化蝶", "岚鸟", "海豹船长", "圆号鱼", "蹦床松鼠", "霹雳迪迪"]) {
    await expect(page.getByText(name)).toBeVisible();
  }
  for (const label of ["属性：虫/萌", "属性：翼", "属性：武/水", "属性：水", "属性：普通", "属性：电/光"]) {
    await expect(page.locator(`.team-rail-left .element-badges[aria-label='${label}']`)).toHaveCount(1);
  }
  await expect(page.locator(".team-rail-left .element-icon")).toHaveCount(9);
  await expect(page.locator(".team-rail-left .element-icon-fallback")).toHaveCount(0);
  await expect(page.locator(".team-rail-left .element-icon").first()).toHaveAttribute(
    "src",
    /\/element-icons\//
  );
  await expect(page.locator(".team-rail-left img.pet-art")).toHaveCount(6);

  const iconGeometry = await page.locator(".team-rail-left .pet-name-bar").first().evaluate((bar) => {
    const label = bar.getBoundingClientRect();
    const icons = [...bar.querySelectorAll(".element-icon-frame")].map((node) =>
      node.getBoundingClientRect()
    );
    const style = getComputedStyle(bar);
    return {
      labelHeight: label.height,
      leftRadius: style.borderTopLeftRadius,
      rightRadius: style.borderTopRightRadius,
      first: {
        width: icons[0]?.width ?? 0,
        height: icons[0]?.height ?? 0,
        left: icons[0]?.left ?? 0,
        right: icons[0]?.right ?? 0,
        top: icons[0]?.top ?? 0
      },
      second: icons[1]
        ? {
            bottom: icons[1].bottom,
            right: icons[1].right
          }
        : undefined,
      labelLeft: label.left
    };
  });

  expect(iconGeometry.first.width).toBeCloseTo(iconGeometry.labelHeight, 0);
  expect(iconGeometry.first.height).toBeCloseTo(iconGeometry.labelHeight, 0);
  expect(iconGeometry.leftRadius).toBe("0px");
  expect(iconGeometry.rightRadius).toBe(`${iconGeometry.labelHeight / 2}px`);
  expect(iconGeometry.first.left).toBeLessThan(iconGeometry.labelLeft);
  expect(iconGeometry.first.right).toBeGreaterThan(iconGeometry.labelLeft);
  expect((iconGeometry.first.left + iconGeometry.first.right) / 2).toBeCloseTo(iconGeometry.labelLeft, 0);
  expect(iconGeometry.second?.bottom).toBeLessThanOrEqual(iconGeometry.first.top);
  expect(iconGeometry.second?.right).toBeLessThanOrEqual(iconGeometry.first.right);

  const labelWidths = await page.locator(".team-rail-left .pet-name-bar").evaluateAll((bars) =>
    bars.map((bar) => Math.round(bar.getBoundingClientRect().width))
  );
  expect(new Set(labelWidths).size).toBe(1);

  const cardBounds = await page.locator(".team-rail-left .roster-card").evaluateAll((cards) => {
    const rects = cards.map((card) => card.getBoundingClientRect());
    return {
      minTop: Math.min(...rects.map((rect) => rect.top)),
      maxBottom: Math.max(...rects.map((rect) => rect.bottom))
    };
  });
  expect(cardBounds.minTop).toBeGreaterThan(80);
  expect(cardBounds.maxBottom).toBeLessThan(980);
});

test("single team OBS page uses the selected 1440p capture size", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          resolution: { width: 2560, height: 1440 }
        }
      })
    });
  });

  await page.setViewportSize({ width: 560, height: 1440 });
  await page.goto("/overlay/default?mode=left");

  await expect(page.getByTestId("roster-card")).toHaveCount(6);
  await expect(page.locator("[data-testid='team-left']")).toBeVisible();
  await expect(page.locator("[data-testid='team-right']")).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const frame = document.querySelector(".output-viewport-frame")?.getBoundingClientRect();
    const scale = document.querySelector(".output-viewport-scale");
    const label = document.querySelector(".team-rail-left .pet-name-bar")?.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(scale ? getComputedStyle(scale).transform : undefined);
    return {
      frame: { width: frame?.width ?? 0, height: frame?.height ?? 0 },
      scale: matrix.a,
      labelHeight: label?.height ?? 0,
      minCardTop: Math.min(...[...document.querySelectorAll(".team-rail-left .roster-card")].map((node) =>
        node.getBoundingClientRect().top
      )),
      maxCardBottom: Math.max(...[...document.querySelectorAll(".team-rail-left .roster-card")].map((node) =>
        node.getBoundingClientRect().bottom
      ))
    };
  });

  expect(geometry.frame.width).toBeCloseTo(560, 0);
  expect(geometry.frame.height).toBeCloseTo(1440, 0);
  expect(geometry.scale).toBeCloseTo(1, 2);
  expect(geometry.labelHeight).toBeGreaterThan(32);
  expect(geometry.minCardTop).toBeGreaterThan(110);
  expect(geometry.maxCardBottom).toBeLessThan(1300);
});

test("pet spacing moves fixed-size cards instead of shrinking pet art", async ({ page }) => {
  async function routeWithGap(cardGap: number) {
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          style: {
            ...resolved.style,
            cardGap,
            imageScale: 1.2
          }
        })
      });
    });
  }

  async function readGeometry() {
    await expect(page.locator(".team-rail-left .pet-art")).toHaveCount(6);
    return page.evaluate(() => {
      const artRects = [...document.querySelectorAll(".team-rail-left .pet-art")]
        .slice(0, 2)
        .map((node) => node.getBoundingClientRect());
      const cardRects = [...document.querySelectorAll(".team-rail-left .roster-card")]
        .slice(0, 2)
        .map((node) => node.getBoundingClientRect());
      return {
        artHeight: artRects[0]?.height ?? 0,
        cardHeight: cardRects[0]?.height ?? 0,
        centerDistance: ((cardRects[1]?.top ?? 0) + (cardRects[1]?.height ?? 0) / 2) -
          ((cardRects[0]?.top ?? 0) + (cardRects[0]?.height ?? 0) / 2)
      };
    });
  }

  await page.setViewportSize({ width: 420, height: 1080 });
  await routeWithGap(0);
  await page.goto("/overlay/default?mode=left");
  const compact = await readGeometry();

  await routeWithGap(72);
  await page.goto("/overlay/default?mode=left");
  const spaced = await readGeometry();

  expect(spaced.artHeight).toBeCloseTo(compact.artHeight, 0);
  expect(spaced.cardHeight).toBeCloseTo(compact.cardHeight, 0);
  expect(spaced.centerDistance).toBeGreaterThan(compact.centerDistance + 60);
});

test("single team export keeps oversized pet art inside evenly spaced slots", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    const colors = ["#2a83d8", "#f8c934", "#8b8bd8", "#dc6558", "#72a7dc", "#e05e9f"];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          imageScale: 1.4
        },
        teams: {
          ...resolved.teams,
          left: {
            ...resolved.teams.left,
            slots: resolved.teams.left.slots.map((slot, index) => ({
              ...slot,
              asset: {
                ...slot.asset,
                imagePath: tallArt(colors[index])
              }
            }))
          }
        }
      })
    });
  });

  await page.setViewportSize({ width: 420, height: 1080 });
  await page.goto("/overlay/default?mode=left");
  await expect(page.getByTestId("roster-card")).toHaveCount(6);

  const artRects = await page.locator(".team-rail-left .pet-art").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      })
      .sort((a, b) => a.top - b.top)
  );

  for (let index = 0; index < artRects.length - 1; index += 1) {
    expect(artRects[index].bottom).toBeLessThanOrEqual(artRects[index + 1].top);
  }
});

test("OBS side parameter renders one anchored team with transparent center", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overlay/default?side=left");

  await expect(page.getByTestId("roster-card")).toHaveCount(6);
  await expect(page.getByText("左队")).toBeVisible();
  await expect(page.getByText("右队")).toHaveCount(0);
  await expect(page.locator(".team-rail-export")).toHaveCount(0);

  const buffer = await page.screenshot({ omitBackground: true });
  const png = PNG.sync.read(buffer);
  const centerX = Math.floor(png.width / 2);
  const centerY = Math.floor(png.height / 2);
  const alpha = png.data[(centerY * png.width + centerX) * 4 + 3];

  expect(alpha).toBe(0);
});

test("overlay keeps the center transparent for OBS compositing", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overlay/default?mode=overlay");
  await expect(page.getByTestId("roster-card")).toHaveCount(12);

  const cardBackground = await page
    .locator(".roster-card")
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(cardBackground).toBe("rgba(0, 0, 0, 0)");

  const buffer = await page.screenshot({ omitBackground: true });
  const png = PNG.sync.read(buffer);
  const centerX = Math.floor(png.width / 2);
  const centerY = Math.floor(png.height / 2);
  const alpha = png.data[(centerY * png.width + centerX) * 4 + 3];

  expect(alpha).toBe(0);
});

test("cloud card background mode renders separated soft pet plates", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          cardBackground: "cloud",
          cardPlateOutlineWidth: 6,
          cardPlateScale: 1.25,
          cardPlateYOffset: 24
        }
      })
    });
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overlay/default?mode=overlay");
  await expect(page.getByTestId("roster-card")).toHaveCount(12);
  await expect(page.locator(".pet-card-plate")).toHaveCount(12);

  const cardBackground = await page
    .locator(".roster-card")
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(cardBackground).toBe("rgba(0, 0, 0, 0)");

  const plateStyle = await page.locator(".pet-card-plate").first().evaluate((node) => {
    const style = getComputedStyle(node);
    const parent = node.closest(".roster-card");
    const rect = node.getBoundingClientRect();
    return {
      tagName: node.tagName,
      display: style.display,
      zIndex: style.zIndex,
      src: node instanceof HTMLImageElement ? node.src : "",
      naturalWidth: node instanceof HTMLImageElement ? node.naturalWidth : 0,
      outlineWidth: style.getPropertyValue("--card-plate-outline-width").trim(),
      filter: style.filter,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top - (parent?.getBoundingClientRect().top ?? 0)),
      parentSide: parent?.getAttribute("data-side")
    };
  });
  expect(plateStyle.tagName).toBe("IMG");
  expect(plateStyle.display).toBe("block");
  expect(plateStyle.zIndex).toBe("1");
  expect(plateStyle.src).toContain("/card-plates/rock-world-cloud-plate.png");
  expect(plateStyle.naturalWidth).toBeGreaterThan(0);
  expect(plateStyle.outlineWidth).toBe("6px");
  expect(plateStyle.filter).toContain("drop-shadow");
  expect(plateStyle.width).toBeGreaterThan(190);
  expect(plateStyle.width).toBeLessThan(230);
  expect(plateStyle.height).toBeGreaterThan(90);
  expect(plateStyle.top).toBeGreaterThan(34);
  expect(plateStyle.parentSide).toBe("left");
});

test("card plate scale changes the rendered cloud plate size", async ({ page }) => {
  let cardPlateScale = 0.75;
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          cardBackground: "cloud",
          cardPlateScale
        }
      })
    });
  });

  const readPlateSize = async () => {
    await page.goto("/overlay/default?mode=overlay");
    await expect(page.locator(".pet-card-plate")).toHaveCount(12);
    return page.locator(".pet-card-plate").first().evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
  };

  await page.setViewportSize({ width: 1920, height: 1080 });
  const small = await readPlateSize();
  cardPlateScale = 1.55;
  const large = await readPlateSize();

  expect(large.width).toBeGreaterThan(small.width + 36);
  expect(large.height).toBeGreaterThan(small.height + 22);
});

test("transparent and rectangle card background modes render distinct plate options", async ({ page }) => {
  let backgroundMode: "transparent" | "rectangle" = "transparent";
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          cardBackground: backgroundMode
        }
      })
    });
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overlay/default?mode=overlay");
  await expect(page.getByTestId("roster-card")).toHaveCount(12);
  await expect(page.locator(".pet-card-plate")).toHaveCount(0);

  backgroundMode = "rectangle";
  await page.goto("/overlay/default?mode=overlay");
  await expect(page.getByTestId("roster-card")).toHaveCount(12);
  await expect(page.locator(".pet-card-plate")).toHaveCount(12);
  const rectangleStyle = await page.locator(".pet-card-plate").first().evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderTopLeftRadius
    };
  });
  expect(rectangleStyle.backgroundColor).toBe("rgba(255, 255, 255, 0.9)");
  expect(rectangleStyle.backgroundImage).toBe("none");
  expect(Number.parseFloat(rectangleStyle.borderRadius)).toBeGreaterThan(12);
});

test("pet plates stay attached to each slot when spacing changes", async ({ page }) => {
  async function routeWithGap(cardGap: number) {
    await page.unroute("**/api/state/default").catch(() => undefined);
    await page.route("**/api/state/default", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...resolved,
          style: {
            ...resolved.style,
            cardBackground: "cloud",
            cardGap
          }
        })
      });
    });
  }

  async function readRelativePlateTop() {
    await page.goto("/overlay/default?mode=overlay");
    await expect(page.locator(".team-rail-left .pet-card-plate")).toHaveCount(6);
    return page.locator(".team-rail-left .roster-card").first().evaluate((card) => {
      const plate = card.querySelector(".pet-card-plate");
      const cardRect = card.getBoundingClientRect();
      const plateRect = plate?.getBoundingClientRect();
      return {
        cardTop: Math.round(cardRect.top),
        relativeTop: Math.round((plateRect?.top ?? 0) - cardRect.top),
        relativeLeft: Math.round((plateRect?.left ?? 0) - cardRect.left)
      };
    });
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await routeWithGap(0);
  const compact = await readRelativePlateTop();
  await routeWithGap(48);
  const spaced = await readRelativePlateTop();

  expect(spaced.cardTop).not.toBe(compact.cardTop);
  expect(spaced.relativeTop).toBe(compact.relativeTop);
  expect(spaced.relativeLeft).toBe(compact.relativeLeft);
});

test("defeated slots gray only the pet art and keep labels readable", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          defeatFilter: { grayscale: 0.8, opacity: 0.45 }
        },
        teams: {
          ...resolved.teams,
          left: {
            ...resolved.teams.left,
            slots: resolved.teams.left.slots.map((slot, index) => ({
              ...slot,
              defeated: index === 0
            }))
          }
        }
      })
    });
  });

  await page.goto("/overlay/default?mode=overlay");
  const firstCard = page.locator(".team-rail-left .roster-card").first();
  const secondCard = page.locator(".team-rail-left .roster-card").nth(1);

  await expect(firstCard).toHaveClass(/roster-card-defeated/);
  await expect(secondCard).not.toHaveClass(/roster-card-defeated/);

  const defeatedArtStyle = await firstCard.locator(".pet-art").evaluate((node) => {
    const style = getComputedStyle(node);
    return { filter: style.filter, opacity: style.opacity };
  });
  const labelFilter = await firstCard.locator(".pet-name-bar").evaluate((node) => getComputedStyle(node).filter);

  expect(defeatedArtStyle.filter).toContain("grayscale(0.8)");
  expect(defeatedArtStyle.opacity).toBe("0.45");
  expect(labelFilter).toBe("none");
});

test("health bars render in OBS and zero health marks the slot defeated", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    const withHealth: ResolvedRosterProject = {
      ...resolved,
      style: {
        ...resolved.style,
        healthBar: { visible: true, showPercent: true, height: 8, gap: 4, autoDefeatAtZero: true }
      },
      teams: {
        ...resolved.teams,
        left: {
          ...resolved.teams.left,
          slots: resolved.teams.left.slots.map((slot, index) => ({
            ...slot,
            health: { percent: index === 0 ? 35 : 100, visible: true, source: "manual" as const }
          }))
        },
        right: {
          ...resolved.teams.right,
          slots: resolved.teams.right.slots.map((slot, index) => ({
            ...slot,
            defeated: index === 0 ? true : slot.defeated,
            health: { percent: index === 0 ? 0 : 100, visible: true, source: "manual" as const }
          }))
        }
      }
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(withHealth)
    });
  });

  await page.goto("/overlay/default?mode=overlay");

  await expect(page.locator(".pet-health-bar")).toHaveCount(12);
  await expect(page.locator(".team-rail-left .pet-health-percent").first()).toHaveText("35%");
  await expect(page.locator(".team-rail-right .roster-card").first()).toHaveClass(/roster-card-defeated/);
});

test("custom name label style is applied to the overlay text frame", async ({ page }) => {
  await page.unroute("**/api/state/default");
  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...resolved,
        style: {
          ...resolved.style,
          nameLabel: {
            fontFamily: "SimHei, sans-serif",
            fontSize: 22,
            fontWeight: 900,
            textColor: "#123456",
            backgroundTop: "#fff9e8",
            backgroundBottom: "#dceeff",
            borderColor: "#2f64c8",
            borderWidth: 3,
            height: 36
          }
        }
      })
    });
  });

  await page.goto("/overlay/default?mode=overlay");
  await expect(page.locator(".team-rail-right .pet-name").nth(3)).toHaveText("海枝枝");

  const labelStyle = await page
    .locator(".team-rail-right .pet-name-bar")
    .nth(3)
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        color: style.color,
        borderColor: style.borderColor,
        height: style.height,
        leftRadius: style.borderTopLeftRadius,
        rightRadius: style.borderTopRightRadius,
        backgroundImage: style.backgroundImage
      };
    });

  expect(labelStyle.color).toBe("rgb(18, 52, 86)");
  expect(labelStyle.borderColor).toBe("rgb(47, 100, 200)");
  expect(labelStyle.height).toBe("36px");
  expect(labelStyle.leftRadius).toBe("0px");
  expect(labelStyle.rightRadius).toBe("18px");
  expect(labelStyle.backgroundImage).toBe("none");
});
