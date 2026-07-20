import { expect, test, type Page } from "@playwright/test";

test("main toolbar opens the floating control panel through the desktop bridge", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "default",
      name: "default",
      teams: {
        left: { label: "Left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "Right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      },
      assetLibrary: { showShiny: false }
    };
    (window as any).__controlWindowOpenCalls = 0;
    (window as any).roster = {
      getState: async () => ({
        project,
        projects: [project],
        activeProjectId: project.id,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: "http://127.0.0.1:51735"
      }),
      saveProject: async () => project,
      activateProject: async () => project,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      exportProjectPreset: async () => undefined,
      importProjectPreset: async () => undefined,
      updateSlotHealth: async () => ({ projectId: project.id, health: {}, updatedAt: new Date().toISOString() }),
      resetHealth: async () => ({ projectId: project.id, health: {}, updatedAt: new Date().toISOString() }),
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      openControlWindow: async () => {
        (window as any).__controlWindowOpenCalls += 1;
      },
      setControlWindowAlwaysOnTop: async () => undefined,
      minimizeControlWindow: async () => undefined,
      closeControlWindow: async () => undefined,
      revealPath: async () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".top-actions button[title='打开直播快捷控制悬浮窗']").click();
  await expect.poll(() => page.evaluate(() => (window as any).__controlWindowOpenCalls as number)).toBe(1);
});

test("floating control quick import fills both teams with the same 12-slot rule as the main editor", async ({
  page
}) => {
  await installFloatingControlMock(page);

  await page.goto("/control");
  await expect(page.locator(".floating-import textarea")).toHaveAttribute("rows", "3");
  await expect(page.locator(".floating-sync-toggle input")).toBeChecked();
  await page.locator(".floating-import textarea").fill("Fire,Water,Grass,Light,Dark,Wing,Rock");
  await page.locator(".floating-fill-left").click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const project = (window as any).__currentProject;
        return {
          saves: (window as any).__savedProjects.length,
          left: project.teams.left.slots.map((slot: any) => slot.name),
          right0: project.teams.right.slots[0]
        };
      })
    )
    .toMatchObject({
      saves: 1,
      left: ["Fire", "Water", "Grass", "Light", "Dark", "Wing"],
      right0: { name: "Rock", assetId: "rock", formAssetId: "rock" }
    });
});

test("floating control can stage live edits while auto sync is off", async ({ page }) => {
  await installFloatingControlMock(page);

  await page.goto("/control");
  const syncToggle = page.locator(".floating-sync-toggle input");
  await syncToggle.setChecked(false);
  await expect.poll(() => page.evaluate(() => (window as any).__savedProjects.length as number)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as any).__currentProject.floatingControl?.liveSync as boolean))
    .toBe(false);

  await page.locator(".floating-import textarea").fill("Fire,Water,Grass,Light,Dark,Wing,Rock");
  await page.locator(".floating-fill-left").click();
  await expect(page.locator(".floating-team-left .floating-slot-name").nth(1)).toContainText("Water");
  await expect(page.locator(".floating-sync-toggle")).toContainText("有暂存");
  await expect.poll(() => page.evaluate(() => (window as any).__savedProjects.length as number)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as any).__currentProject.teams.left.slots[1]?.name ?? ""))
    .toBe("");

  await syncToggle.setChecked(true);
  await expect.poll(() => page.evaluate(() => (window as any).__savedProjects.length as number)).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__currentProject.teams.left.slots.map((slot: any) => slot.name).join(","))
    )
    .toContain("Fire,Water,Grass,Light,Dark,Wing");
  await expect
    .poll(() => page.evaluate(() => (window as any).__currentProject.floatingControl?.liveSync as boolean))
    .toBe(true);
});

test("floating control uses broadcast glass styling and a readable custom form menu", async ({ page }) => {
  await installFloatingControlMock(page);

  await page.goto("/control");

  const shellStyle = await page.locator(".floating-control-shell").evaluate((node) => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      backdropFilter: style.backdropFilter || (style as any).webkitBackdropFilter,
      borderRadius: style.borderRadius,
      color: style.color,
      boxShadow: style.boxShadow,
      left: rect.left,
      top: rect.top,
      rightGutter: window.innerWidth - rect.right,
      bottomGutter: window.innerHeight - rect.bottom,
      hasViewportScroll:
        document.documentElement.scrollHeight > window.innerHeight ||
        document.documentElement.scrollWidth > window.innerWidth ||
        document.body.scrollHeight > window.innerHeight ||
        document.body.scrollWidth > window.innerWidth
    };
  });
  expect(shellStyle.backdropFilter).toContain("blur");
  expect(shellStyle.borderRadius).toBe("26px");
  expect(shellStyle.color).toBe("rgb(248, 251, 255)");
  expect(shellStyle.boxShadow).toContain("rgba(0, 0, 0");
  expect(shellStyle.left).toBe(0);
  expect(shellStyle.top).toBe(0);
  expect(shellStyle.rightGutter).toBe(0);
  expect(shellStyle.bottomGutter).toBe(0);
  expect(shellStyle.hasViewportScroll).toBe(false);
  await expect(page.locator(".floating-window-actions button span")).toHaveCount(0);

  await page.locator(".floating-settings-button").click();
  await expect(page.locator(".floating-settings-popover")).toBeVisible();
  await expect(page.locator(".floating-setting-range input")).toHaveCount(2);
  await expect(page.locator(".floating-settings-popover")).toContainText("玻璃强度");
  await expect(page.locator(".floating-settings-popover")).toContainText("界面大小");
  const glassRange = page.locator(".floating-setting-range input").first();
  await expect(glassRange).toHaveAttribute("max", "140");
  const setGlassRange = (value: string) =>
    glassRange.evaluate((node, nextValue) => {
      const input = node as HTMLInputElement;
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  await setGlassRange("0");
  await expect(page.locator(".floating-control-shell")).toHaveCSS("opacity", "0.72");
  await expect.poll(() => page.evaluate(() => (window as any).__savedProjects.length as number)).toBe(1);
  await glassRange.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    for (const nextValue of ["72", "110", "140"]) {
      valueSetter?.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await expect(page.locator(".floating-control-shell")).toHaveCSS("opacity", "0.985");
  await expect(page.locator(".floating-settings-popover")).toContainText("极厚");
  await expect.poll(() => page.evaluate(() => (window as any).__savedProjects.length as number)).toBe(2);
  await expect
    .poll(() => page.evaluate(() => (window as any).__currentProject.floatingControl?.glassStrength as number))
    .toBe(140);
  await page.locator(".floating-settings-head button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__focusMainCalls as number)).toBe(1);

  await expect(page.locator(".floating-team-left select")).toHaveCount(0);
  const trigger = page.locator(".floating-team-left .floating-form-trigger").first();
  await expect(trigger).toHaveCSS("color", "rgb(249, 251, 255)");
  await trigger.click();
  await expect(page.locator(".floating-form-menu")).toBeVisible();

  const optionStyle = await page.locator(".floating-form-option").nth(1).evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor
    };
  });
  expect(optionStyle.color).not.toBe(optionStyle.backgroundColor);
  expect(optionStyle.backgroundColor).not.toBe("rgb(255, 255, 255)");
});

test("floating control updates form, defeated state, pin state, and room match text", async ({ page }) => {
  await installFloatingControlMock(page);

  await page.goto("/control");
  await page.locator(".floating-team-left .floating-form-trigger").first().click();
  await page.getByRole("option", { name: "Boss" }).click();
  await page.locator(".floating-team-left .floating-defeated input").first().check();
  await page.locator(".floating-pin-button").click();
  await page.locator(".floating-match input").nth(0).fill("Alice");
  await page.locator(".floating-match input").nth(1).fill("9");
  await page.locator(".floating-match input").nth(2).fill("Bob");
  await page.locator(".floating-match input").nth(3).fill("1");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const project = (window as any).__currentProject;
        const byRole = new Map(project.room.textBoxes.map((box: any) => [box.role, box.text]));
        const pinStates = (window as any).__pinStates as boolean[];
        return {
          saveCount: (window as any).__savedProjects.length,
          lastPinState: pinStates.at(-1),
          firstSlot: project.teams.left.slots[0],
          match: {
            playerLeft: byRole.get("player-left"),
            playerRight: byRole.get("player-right"),
            scoreLeft: byRole.get("score-left"),
            scoreRight: byRole.get("score-right")
          }
        };
      })
    )
    .toMatchObject({
      lastPinState: false,
      firstSlot: { name: "Fire Boss", assetId: "fire-boss", formAssetId: "fire-boss", defeated: true },
      match: { playerLeft: "Alice", playerRight: "Bob", scoreLeft: "9", scoreRight: "1" }
    });

  expect(await page.evaluate(() => (window as any).__savedProjects.length as number)).toBeGreaterThanOrEqual(3);
});

async function installFloatingControlMock(page: Page) {
  await page.addInitScript(() => {
    const svg = (color: string) =>
      `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="${color}"/></svg>`
      )}`;
    const assets = [
      {
        id: "fire",
        name: "Fire",
        aliases: [],
        element: "fire",
        imagePath: svg("#ff6a2a"),
        chainKey: "fire-chain",
        formLabel: "Default",
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      {
        id: "fire-boss",
        name: "Fire Boss",
        aliases: ["Boss Fire"],
        element: "fire",
        imagePath: svg("#dd2018"),
        chainKey: "fire-chain",
        formLabel: "Boss",
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      {
        id: "water",
        name: "Water",
        aliases: [],
        element: "water",
        imagePath: svg("#3aa5ff"),
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      {
        id: "grass",
        name: "Grass",
        aliases: [],
        element: "grass",
        imagePath: svg("#61c779"),
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      {
        id: "light",
        name: "Light",
        aliases: [],
        element: "light",
        imagePath: svg("#f7d248"),
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      {
        id: "dark",
        name: "Dark",
        aliases: [],
        element: "dark",
        imagePath: svg("#6655cc"),
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      {
        id: "wing",
        name: "Wing",
        aliases: [],
        element: "wing",
        imagePath: svg("#6f88d8"),
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      {
        id: "rock",
        name: "Rock",
        aliases: [],
        element: "rock",
        imagePath: svg("#ba895a"),
        updatedAt: "2026-06-30T00:00:00.000Z"
      }
    ];
    const textBox = (id: string, role: string, text: string, x: number, width: number) => ({
      id,
      role,
      text,
      x,
      y: 24,
      width,
      height: 60,
      fontFamily: "MiSans",
      fontSize: 34,
      fontWeight: 800,
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
      opacity: 1
    });
    let currentProject = {
      id: "default",
      name: "default",
      teams: {
        left: {
          label: "Left",
          slots: [
            { name: "Fire", assetId: "fire", formAssetId: "fire", element: "fire" },
            ...Array.from({ length: 5 }, () => ({ name: "" }))
          ]
        },
        right: { label: "Right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      },
      room: {
        mode: "competition",
        background: { visible: true, fit: "cover", opacity: 1, dim: 0, edgeBlur: 0 },
        textBoxes: [
          textBox("room-title", "title", "S2", 640, 640),
          textBox("room-player-left", "player-left", "Left Player", 360, 280),
          textBox("room-player-right", "player-right", "Right Player", 1280, 280),
          textBox("room-score-left", "score-left", "0", 280, 90),
          textBox("room-score-right", "score-right", "0", 1550, 90),
          textBox("room-custom", "custom", "Keep", 800, 160)
        ],
        guides: { visible: false, mode: "safe" }
      },
      assetLibrary: { showShiny: false }
    };
    (window as any).__currentProject = currentProject;
    (window as any).__savedProjects = [];
    (window as any).__pinStates = [];
    (window as any).__focusMainCalls = 0;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof currentProject) => {
        currentProject = nextProject;
        (window as any).__currentProject = nextProject;
        (window as any).__savedProjects.push(nextProject);
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      exportProjectPreset: async () => undefined,
      importProjectPreset: async () => undefined,
      updateSlotHealth: async () => ({ projectId: currentProject.id, health: {}, updatedAt: new Date().toISOString() }),
      resetHealth: async () => ({ projectId: currentProject.id, health: {}, updatedAt: new Date().toISOString() }),
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      openControlWindow: async () => undefined,
      focusMainWindow: async () => {
        (window as any).__focusMainCalls += 1;
      },
      setControlWindowAlwaysOnTop: async (alwaysOnTop: boolean) => {
        (window as any).__pinStates.push(alwaysOnTop);
      },
      minimizeControlWindow: async () => undefined,
      closeControlWindow: async () => undefined,
      revealPath: async () => undefined
    };
  });
}
