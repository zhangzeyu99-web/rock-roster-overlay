import { expect, test } from "@playwright/test";

test("runtime cache monitor shows status and manual cleanup stays reachable", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
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
      },
      assetLibrary: { showShiny: false },
      room: {
        mode: "competition",
        background: {
          visible: true,
          imagePath: "builtin:world-room-v3",
          fit: "cover",
          opacity: 1,
          dim: 0.12,
          edgeBlur: 0
        },
        textBoxes: [
          {
            id: "room-title",
            role: "title",
            text: "S3·铅字幻梦",
            x: 500,
            y: 20,
            width: 920,
            height: 108,
            fontFamily: "Microsoft YaHei UI",
            fontSize: 44,
            fontWeight: 800,
            color: "#111111",
            strokeEnabled: true,
            strokeColor: "#7c3b00",
            strokeWidth: 1.4,
            shadowColor: "rgba(70, 35, 0, 0.45)",
            background: "#f59a23",
            backgroundOpacity: 1,
            borderColor: "#7c3b00",
            borderWidth: 3,
            radius: 18,
            align: "center",
            opacity: 1
          }
        ],
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
            preset: "classic",
            boText: "BO5",
            avatarVisible: false,
            animation: true
          }
        },
        guides: { visible: false, mode: "safe" }
      }
    };
    let status: any = {
      totalPrivateMb: 512,
      totalWorkingSetMb: 640,
      processCount: 4,
      rendererCount: 1,
      largestProcessMb: 260,
      warningPrivateMb: 700,
      criticalPrivateMb: 950,
      criticalWorkingSetMb: 1400,
      level: "normal",
      cleanupInProgress: false,
      cleanupCount: 0,
      updatedAt: new Date().toISOString()
    };
    (window as any).__runtimeClears = 0;
    (window as any).roster = {
      getState: async () => ({
        project,
        projects: [project],
        activeProjectId: project.id,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: window.location.origin
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
      openControlWindow: async () => undefined,
      setControlWindowAlwaysOnTop: async () => undefined,
      minimizeControlWindow: async () => undefined,
      closeControlWindow: async () => undefined,
      getRuntimeCacheStatus: async () => status,
      clearRuntimeCache: async () => {
        (window as any).__runtimeClears += 1;
        status = {
          ...status,
          totalPrivateMb: 380,
          totalWorkingSetMb: 520,
          cleanupCount: 1,
          lastCleanupAt: new Date().toISOString(),
          lastCleanupReason: "manual"
        };
        return status;
      },
      onRuntimeCacheChanged: () => () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await expect(page.locator(".app-nav")).not.toContainText("素材");
  await expect(page.locator(".system-status-panel")).toContainText("素材库");
  await expect(page.locator(".system-status-panel")).toContainText("运行占用");
  await expect(page.locator(".system-status-cache")).toContainText("正常 512MB");
  await page.locator(".system-status-head button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__runtimeClears as number)).toBe(1);
  await expect(page.locator(".system-status-cache")).toContainText("正常 380MB");
});

test("room text editing stays stable while dragging, resizing, and changing style controls", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });

  await page.addInitScript(() => {
    const project = {
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
      },
      assetLibrary: { showShiny: false }
    };
    let currentProject = project;
    (window as any).__saveCalls = 0;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        (window as any).__saveCalls += 1;
        return nextProject;
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav").getByRole("button", { name: "装修", exact: true }).click();
  const titleBox = page.locator(".room-text-title");
  await expect(titleBox).toBeVisible();
  await titleBox.click();

  const previewGeometry = await page.locator(".preview-board .output-viewport-frame").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const scaled = node.querySelector(".output-viewport-scale");
    const matrix = new DOMMatrixReadOnly(getComputedStyle(scaled as Element).transform);
    return {
      ratio: rect.width / rect.height,
      scale: matrix.a,
      expectedScale: rect.width / 1920
    };
  });
  expect(previewGeometry.ratio).toBeCloseTo(16 / 9, 3);
  expect(previewGeometry.scale).toBeCloseTo(previewGeometry.expectedScale, 3);

  const startBox = await titleBox.boundingBox();
  expect(startBox).not.toBeNull();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + startBox!.width / 2 + 120, startBox!.y + startBox!.height / 2 + 28, {
    steps: 6
  });
  await page.mouse.up();
  await page.waitForTimeout(80);

  let saveCalls = await page.evaluate(() => (window as any).__saveCalls as number);
  expect(saveCalls).toBeLessThanOrEqual(2);

  const movedBox = await titleBox.boundingBox();
  expect(movedBox?.x).toBeGreaterThan(startBox!.x + 20);

  const handle = page.locator(".room-resize-handle");
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  const widthBeforeResize = movedBox!.width;
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 90, handleBox!.y + handleBox!.height / 2 + 24, {
    steps: 5
  });
  await page.mouse.up();
  await page.waitForTimeout(80);

  const resizedBox = await titleBox.boundingBox();
  expect(resizedBox?.width).toBeGreaterThan(widthBeforeResize + 20);

  const selectedTextStylePanel = page.getByTestId("room-selected-text-style");
  await expect.poll(() => selectedTextStylePanel.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);
  await page.locator(".room-text-controls input[type='color']").first().evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "#ff5500");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => titleBox.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await selectedTextStylePanel.locator(".color-field input[type='color']").nth(3).evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "#335577");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => titleBox.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(51, 85, 119)");

  const backgroundOpacityRange = selectedTextStylePanel.locator("input[type='range']").nth(1);
  await backgroundOpacityRange.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "35");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => titleBox.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(51, 85, 119, 0.35)");
  await backgroundOpacityRange.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "0");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => titleBox.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  await selectedTextStylePanel.locator('.color-field:has-text("边框") input[type="color"]').evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "#33aaee");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await selectedTextStylePanel.locator('label.field-row:has-text("边框宽") input[type="range"]').evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "4");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => titleBox.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe("rgb(51, 170, 238)");
  expect(
    await titleBox.evaluate((node) => Number.parseFloat(getComputedStyle(node).borderTopWidth))
  ).toBeGreaterThan(0);

  const strokeToggle = selectedTextStylePanel.locator(".toggle-row input[type='checkbox']").first();
  await strokeToggle.check();
  await expect
    .poll(() =>
      titleBox.evaluate((node) => {
        const boxStyle = getComputedStyle(node);
        const textStyle = getComputedStyle(node.querySelector("span") as HTMLElement);
        return {
          strokeWidth: Number.parseFloat(boxStyle.getPropertyValue("--room-text-stroke")),
          strokeColor: boxStyle.getPropertyValue("--room-text-stroke-color").trim(),
          textShadow: textStyle.textShadow
        };
      })
    )
    .toMatchObject({
      strokeWidth: expect.any(Number),
      strokeColor: "#527f57",
      textShadow: "none"
    });
  await strokeToggle.uncheck();
  await expect
    .poll(() =>
      titleBox.evaluate((node) => {
        const boxStyle = getComputedStyle(node);
        const textStyle = getComputedStyle(node.querySelector("span") as HTMLElement);
        return {
          strokeWidth: boxStyle.getPropertyValue("--room-text-stroke").trim(),
          strokeColor: boxStyle.getPropertyValue("--room-text-stroke-color").trim(),
          textShadow: textStyle.textShadow
        };
      })
    )
    .toMatchObject({
      strokeWidth: "0px",
      strokeColor: "transparent"
    });
  await expect
    .poll(() => titleBox.evaluate((node) => getComputedStyle(node.querySelector("span") as HTMLElement).textShadow))
    .not.toContain("rgb(255, 255, 255)");

  await page.getByTestId("room-background-advanced").locator("summary").click();
  await page.getByTestId("room-background-advanced").locator('label.field-row:has-text("四周虚化") input[type="range"]').evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "32");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator(".room-background-edge-blur")).toBeVisible();
  await expect.poll(() => page.locator(".room-background-edge-blur").evaluate((node) => getComputedStyle(node).filter)).toContain("blur(");

  await selectedTextStylePanel.locator(".font-picker select").selectOption("genshin");
  await expect
    .poll(() => titleBox.evaluate((node) => (node as HTMLElement).style.fontFamily))
    .toContain("HYWenHei Extended");

  await selectedTextStylePanel.locator('label.field-row:has-text("字重") select').selectOption("900");
  await selectedTextStylePanel.locator('label.field-row:has-text("对齐") select').selectOption("right");
  await page.waitForTimeout(360);

  saveCalls = await page.evaluate(() => (window as any).__saveCalls as number);
  expect(saveCalls).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
});

test("room title image can be selected, moved, and resized from the preview", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
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
      },
      assetLibrary: { showShiny: false }
    };
    let currentProject = project;
    (window as any).__saveCalls = 0;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        (window as any).__saveCalls += 1;
        return nextProject;
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav").getByRole("button", { name: "装修", exact: true }).click();

  const titleImage = page.locator(".room-broadcast-title");
  const titleImageToggle = page.locator(".room-hud-title-actions").first().locator("button").nth(1);
  await expect(titleImage).toBeHidden();
  await titleImageToggle.click();
  await expect(titleImage).toBeVisible();
  const startBox = await titleImage.boundingBox();
  expect(startBox).not.toBeNull();

  await page.mouse.click(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await expect(titleImage).toHaveClass(/room-broadcast-title-selected/);
  await expect(page.locator(".preview-title")).toContainText("正在编辑 标题图");

  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + startBox!.width / 2 + 80, startBox!.y + startBox!.height / 2 + 30, {
    steps: 6
  });
  await page.mouse.up();
  await page.waitForTimeout(80);

  const movedBox = await titleImage.boundingBox();
  expect(movedBox?.x).toBeGreaterThan(startBox!.x + 20);
  expect(movedBox?.y).toBeGreaterThan(startBox!.y + 8);

  const handle = page.locator(".room-broadcast-title .room-resize-handle");
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  const widthBeforeResize = movedBox!.width;
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 90, handleBox!.y + handleBox!.height / 2 + 28, {
    steps: 5
  });
  await page.mouse.up();
  await page.waitForTimeout(80);

  const resizedBox = await titleImage.boundingBox();
  expect(resizedBox?.width).toBeGreaterThan(widthBeforeResize + 20);
  await expect.poll(() => page.evaluate(() => (window as any).__saveCalls as number)).toBeGreaterThanOrEqual(2);
});

test("hidden room title image reveals the editable title text style controls", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
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
      },
      assetLibrary: { showShiny: false }
    };
    let currentProject = project;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        return nextProject;
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav button").nth(1).click();

  const titleImage = page.locator(".room-broadcast-title");
  const titleText = page.locator(".room-text-title");
  const titleImageToggle = page.locator(".room-hud-title-actions").first().locator("button").nth(1);

  await expect(titleImage).toBeHidden();
  await expect(titleText).toBeVisible();
  await titleText.click();
  await expect(titleText).toHaveClass(/room-text-box-selected/);
  await expect(titleText).toHaveAttribute("data-fill-style", "s3-lead-prism");
  await expect
    .poll(() => titleText.locator("span").first().evaluate((node) => getComputedStyle(node).backgroundImage))
    .toBe("none");
  await expect
    .poll(() => titleText.locator("span").first().evaluate((node) => getComputedStyle(node).webkitTextFillColor))
    .toBe("rgba(0, 0, 0, 0)");
  await expect.poll(() => titleText.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await expect.poll(() => titleText.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("0px");
  await expect
    .poll(async () =>
      Number.parseFloat(
        await titleText.locator("span").first().evaluate((node) => getComputedStyle(node).webkitTextStrokeWidth)
      )
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId("room-title-image-advanced")).toHaveCount(0);
  await expect(page.getByTestId("room-event-style")).toHaveCount(0);
  await expect(page.getByTestId("room-selected-text-style")).toBeVisible();

  const selectedTextStylePanel = page.getByTestId("room-selected-text-style");
  await expect.poll(() => selectedTextStylePanel.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);
  await expect(selectedTextStylePanel.locator('label.field-row:has-text("填充") select')).toHaveValue("s3-lead-prism");
  await expect(selectedTextStylePanel.locator(".font-picker select")).toBeVisible();
  await expect(selectedTextStylePanel.locator(".font-option-grid")).toHaveCount(0);
  await selectedTextStylePanel.screenshot({ path: "output/playwright/font-picker-simplified.png" });
  await selectedTextStylePanel.locator(".room-text-style-presets button").filter({ hasText: "联赛金冠" }).click();
  await expect(titleText).toHaveAttribute("data-fill-style", "solid");
  await expect
    .poll(() => titleText.locator("span").first().evaluate((node) => getComputedStyle(node).webkitTextFillColor))
    .toBe("rgb(255, 220, 74)");
  await selectedTextStylePanel.locator(".font-picker select").selectOption("genshin");
  await expect
    .poll(() => titleText.evaluate((node) => (node as HTMLElement).style.fontFamily))
    .toContain("HYWenHei Extended");

  await selectedTextStylePanel.locator(".color-field input[type='color']").first().evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "#00ff66");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => titleText.evaluate((node) => getComputedStyle(node).color)).toBe("rgb(0, 255, 102)");

  await titleImageToggle.click();
  await expect(titleImage).toBeVisible();
  await expect(titleText).toBeHidden();
  await expect(page.getByTestId("room-title-image-advanced")).toBeVisible();
  await expect(page.getByTestId("room-event-style")).toHaveCount(0);
  await expect(page.getByTestId("room-selected-text-style")).toHaveCount(0);

  await titleImageToggle.click();
  await expect(titleImage).toBeHidden();
  await expect(titleText).toBeVisible();
  await expect(page.getByTestId("room-selected-text-style")).toBeVisible();
});

test("room mode presets switch between new and v3.2.5 layouts without exposing free mode", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "default",
      name: "default",
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true,
        teamLayout: { mode: "curved", centerGap: 1540, verticalOffset: 0 }
      },
      assetLibrary: { showShiny: false }
    };
    let currentProject: any = project;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav button").nth(1).click();

  const modeButtons = page.locator(".room-design-section .room-control-group").first().locator(".room-action-row button");
  await expect(modeButtons).toHaveCount(2);
  await expect(page.locator(".room-design-section .room-control-group").first()).not.toContainText("自由模式");
  await expect(page.locator(".preview-board [data-layout-mode]")).toHaveAttribute("data-layout-mode", "curved");

  await modeButtons.nth(1).click();
  await expect(page.locator(".preview-board [data-layout-mode]")).toHaveAttribute("data-layout-mode", "vertical");
  await expect
    .poll(() => page.evaluate(() => (window as any).roster.getState().then((state: any) => state.project.style.teamLayout.mode)))
    .toBe("vertical");

  await modeButtons.first().click();
  await expect(page.locator(".preview-board [data-layout-mode]")).toHaveAttribute("data-layout-mode", "curved");
});

test("room player avatar slot hides by default and supports picker or import", async ({ page }) => {
  await page.addInitScript(() => {
    const avatarAssets = [
      {
        id: "avatar-dimo",
        name: "迪莫",
        aliases: [],
        element: "光",
        imagePath: "dimo.png",
        avatarPath:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%2386c5ff'/%3E%3Ccircle cx='25' cy='28' r='7' fill='%23fff'/%3E%3Ccircle cx='40' cy='28' r='7' fill='%23fff'/%3E%3Cpath d='M22 44c8 6 18 6 25 0' stroke='%230f4676' stroke-width='5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "avatar-shuiling",
        name: "水灵",
        aliases: ["水蓝蓝最终"],
        element: "水",
        imagePath: "shuiling.png",
        avatarPath:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%2397e4f7'/%3E%3Ccircle cx='32' cy='31' r='18' fill='%23e7fbff'/%3E%3Ccircle cx='25' cy='29' r='4' fill='%230f4676'/%3E%3Ccircle cx='39' cy='29' r='4' fill='%230f4676'/%3E%3Cpath d='M27 42h10' stroke='%230f4676' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    const project = {
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
      },
      assetLibrary: { showShiny: false }
    };
    let currentProject: any = project;
    (window as any).__expectedShuilingAvatarPath = avatarAssets[1].avatarPath;
    (window as any).__hudImageImports = 0;
    (window as any).__hudImageExports = [];
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets: avatarAssets,
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      importHudImage: async () => {
        (window as any).__hudImageImports += 1;
        return `assets/hud/imported-avatar-${(window as any).__hudImageImports}.png`;
      },
      exportHudImage: async (imagePath: string, suggestedName?: string) => {
        (window as any).__hudImageExports.push({ imagePath, suggestedName });
        return `C:/tmp/${suggestedName}.png`;
      },
      exportPng: async () => "C:/tmp/team-overlay.png",
      exportProjectPreset: async () => undefined,
      importProjectPreset: async () => undefined,
      updateSlotHealth: async () => ({ projectId: currentProject.id, health: {}, updatedAt: new Date().toISOString() }),
      resetHealth: async () => ({ projectId: currentProject.id, health: {}, updatedAt: new Date().toISOString() }),
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      openControlWindow: async () => undefined,
      setControlWindowAlwaysOnTop: async () => undefined,
      minimizeControlWindow: async () => undefined,
      closeControlWindow: async () => undefined,
      getRuntimeCacheStatus: async () => undefined,
      clearRuntimeCache: async () => undefined,
      onRuntimeCacheChanged: () => () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav button").nth(1).click();

  await expect(page.getByTestId("room-avatar-hidden-toggle")).toBeChecked();
  await expect(page.locator(".room-player-avatar-slot")).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator(".room-player-side-left.room-player-side-no-avatar .room-player-name").evaluate((element) => {
        const style = window.getComputedStyle(element);
        return { justifySelf: style.justifySelf, textAlign: style.textAlign, paddingRight: style.paddingRight };
      })
    )
    .toEqual({ justifySelf: "stretch", textAlign: "center", paddingRight: "0px" });
  await expect
    .poll(() =>
      page.locator(".room-player-side-right.room-player-side-no-avatar .room-player-name").evaluate((element) => {
        const style = window.getComputedStyle(element);
        return { justifySelf: style.justifySelf, textAlign: style.textAlign, paddingLeft: style.paddingLeft };
      })
    )
    .toEqual({ justifySelf: "stretch", textAlign: "center", paddingLeft: "0px" });
  await expect(page.getByTestId("room-avatar-left-export")).toHaveCount(0);
  await expect(page.getByTestId("room-avatar-library")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("room-avatar-search")).toBeHidden();

  await page.getByTestId("room-avatar-library").locator("summary").click();
  await expect(page.getByTestId("room-avatar-search")).toBeVisible();
  await page.getByTestId("room-avatar-search").fill("水灵");
  await expect(page.getByTestId("room-avatar-left-choice-0")).toContainText("水灵");
  await expect(page.getByTestId("room-avatar-left-choice-1")).toHaveCount(0);
  await page.getByTestId("room-avatar-left-choice-0").click();
  await expect(page.getByTestId("room-avatar-hidden-toggle")).not.toBeChecked();
  await expect(page.locator(".room-player-avatar-slot")).toHaveCount(2);
  await expect
    .poll(() =>
      page.locator(".room-player-avatar").first().evaluate((element) => {
        const style = window.getComputedStyle(element);
        return { borderRadius: style.borderRadius, objectFit: style.objectFit, clipPath: style.clipPath };
      })
    )
    .toEqual(expect.objectContaining({ borderRadius: "999px", objectFit: "cover" }));
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).roster.getState().then((state: any) => state.project.room?.hud?.playerBar.avatarVisible)
      )
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).roster.getState().then((state: any) => state.project.room?.hud?.playerBar.leftAvatarPath)
      )
    )
    .toBe(await page.evaluate(() => (window as any).__expectedShuilingAvatarPath));

  await page.getByTestId("room-avatar-left-import").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).roster.getState().then((state: any) => state.project.room?.hud?.playerBar.leftAvatarPath)
      )
    )
    .toBe("assets/hud/imported-avatar-1.png");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).roster.getState().then((state: any) => state.project.room?.hud?.playerBar.avatarVisible)
      )
    )
    .toBe(true);
});

test("room scoreboard style select switches enabled presets in preview", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
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
      },
      assetLibrary: { showShiny: false }
    };
    let currentProject: any = project;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
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
      setControlWindowAlwaysOnTop: async () => undefined,
      minimizeControlWindow: async () => undefined,
      closeControlWindow: async () => undefined,
      getRuntimeCacheStatus: async () => undefined,
      clearRuntimeCache: async () => undefined,
      onRuntimeCacheChanged: () => () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav button").nth(1).click();

  const visibilityDetails = page.getByTestId("room-hud-visibility");
  await expect(visibilityDetails).not.toHaveAttribute("open", "");
  await expect(visibilityDetails.locator("input[type='checkbox']").first()).toBeHidden();
  await visibilityDetails.locator("summary").click();
  await expect(visibilityDetails).toHaveAttribute("open", "");
  const scoreVisibleToggle = visibilityDetails.locator(".toggle-row", { hasText: "显示比分" }).locator("input");
  await expect(scoreVisibleToggle).toBeChecked();
  await scoreVisibleToggle.setChecked(false);
  await expect(page.locator(".preview-board .room-score-pill")).toHaveClass(/room-score-pill-hidden/);

  const presetSelect = page.locator(".room-hud-controls select").first();
  const playerBar = page.locator(".preview-board .room-player-bar");
  const variants = [
    ["s3-storybook", "room-player-bar-preset-s3-storybook"],
    ["s3-prism-bookmark", "room-player-bar-preset-s3-prism-bookmark"],
    ["s3-clover-hinge", "room-player-bar-preset-s3-clover-hinge"],
    ["classic", "room-player-bar-preset-classic"],
    ["compact", "room-player-bar-preset-compact"],
    ["player-score", "room-player-bar-preset-player-score"]
  ] as const;

  await expect(presetSelect).toHaveValue("s3-clover-hinge");
  await expect(presetSelect.locator("option")).toHaveCount(6);
  const presetOptions = await presetSelect.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value)
  );
  expect(presetOptions).toEqual([
    "s3-clover-hinge",
    "s3-storybook",
    "s3-prism-bookmark",
    "classic",
    "compact",
    "player-score"
  ]);
  for (const [preset, expectedClass] of variants) {
    await presetSelect.selectOption(preset);
    await expect(playerBar).toHaveClass(new RegExp(expectedClass));
  }
  await presetSelect.selectOption("s3-clover-hinge");
  const initialSize = await playerBar.boundingBox();
  const initialNameFontSize = await playerBar.locator(".room-player-name").first().evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize)
  );
  const sizeDetails = page.getByTestId("room-player-bar-size");
  await sizeDetails.locator("summary").click();
  const sizeSliders = sizeDetails.locator("input[type='range']");
  await expect(sizeSliders).toHaveCount(2);
  await sizeSliders.nth(0).fill("1.2");
  await sizeSliders.nth(1).fill("1.8");
  await expect(sizeDetails.locator("output").nth(0)).toHaveText("120%");
  await expect(sizeDetails.locator("output").nth(1)).toHaveText("180%");
  const adjustedSize = await playerBar.boundingBox();
  const adjustedNameFontSize = await playerBar.locator(".room-player-name").first().evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize)
  );
  expect(initialSize).not.toBeNull();
  expect(adjustedSize).not.toBeNull();
  expect(adjustedSize!.width).toBeGreaterThan(initialSize!.width * 1.15);
  expect(adjustedNameFontSize).toBeGreaterThan(initialNameFontSize * 1.7);
  const scoreTextGeometry = await playerBar.evaluate((bar) => {
    const score = bar.querySelector(".room-score-value-left");
    const separator = bar.querySelector(".room-score-separator");
    if (!score || !separator) return undefined;
    const range = document.createRange();
    range.selectNodeContents(score);
    return {
      scoreTextRight: range.getBoundingClientRect().right,
      separatorLeft: separator.getBoundingClientRect().left
    };
  });
  expect(scoreTextGeometry).toBeDefined();
  expect(scoreTextGeometry!.scoreTextRight).toBeLessThan(scoreTextGeometry!.separatorLeft - 2);
  await scoreVisibleToggle.setChecked(true);
  await page.screenshot({ path: "output/playwright/s3-player-bar-settings.png", animations: "disabled" });
});

test("preview mode and resolution controls drive OBS and current export mode", async ({ page }) => {
  await page.addInitScript(() => {
    const svg = (color: string) =>
      `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="${color}"/></svg>`
      )}`;
    const assets = Array.from({ length: 6 }, (_, index) => ({
      id: `pet-${index}`,
      name: `Pet ${index + 1}`,
      aliases: [],
      element: index % 2 === 0 ? "火" : "水",
      imagePath: svg(index % 2 === 0 ? "#ff6a2a" : "#3aa5ff"),
      updatedAt: "2026-06-17T00:00:00.000Z"
    }));
    const slots = assets.map((asset) => ({ name: asset.name, assetId: asset.id, formAssetId: asset.id }));
    let currentProject = {
      id: "default",
      name: "capture-mode-test",
      teams: {
        left: { label: "Left", slots },
        right: { label: "Right", slots }
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
    (window as any).__exportModes = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined }
    });
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: "http://127.0.0.1:51735"
      }),
      saveProject: async (nextProject: typeof currentProject) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async (mode: string) => {
        (window as any).__exportModes.push(mode);
        return `C:/tmp/${mode}.png`;
      },
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: async () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".preview-switch button").nth(0).click();
  await page.locator(".resolution-entry").click();
  await page.locator(".resolution-preset-row").getByRole("button", { name: "2560 x 1440" }).click();

  await expect(page.locator(".top-obs-url input")).toHaveValue(/mode=left/);
  await expect(page.locator(".resolution-entry")).toContainText("2560 x 1440");
  await expect(page.locator(".preview-title span")).not.toContainText("2560");
  await expect(page.getByTestId("roster-card")).toHaveCount(6);

  await page.locator(".top-actions .primary-button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__exportModes as string[])).toContainEqual("left");
  await expect(page.locator(".top-export-feedback")).toContainText("left.png");
});

test("unfinished beta tools stay hidden from the main workspace", async ({ page }) => {
  await page.addInitScript(() => {
    const svg = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="#ff6a2a"/></svg>`
    )}`;
    const assets = [
      {
        id: "fire",
        name: "火神",
        aliases: [],
        element: "火",
        imagePath: svg,
        updatedAt: "2026-06-22T00:00:00.000Z"
      }
    ];
    const emptySlots = Array.from({ length: 5 }, () => ({ name: "" }));
    let liveState = {
      projectId: "default",
      health: {},
      updatedAt: "2026-06-22T00:00:00.000Z"
    };
    let currentProject = {
      id: "default",
      name: "health-test",
      teams: {
        left: { label: "Left", slots: [{ name: "火神", assetId: "fire", formAssetId: "fire" }, ...emptySlots] },
        right: { label: "Right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 8,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      },
      assetLibrary: { showShiny: false }
    };
    (window as any).__healthCalls = [];
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets,
        liveState,
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof currentProject) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      updateSlotHealth: async (side: string, index: number, health: { percent?: number }) => {
        (window as any).__healthCalls.push({ side, index, health });
        liveState = {
          ...liveState,
          health: {
            ...liveState.health,
            [`${side}:${index}`]: { percent: health.percent ?? 100, visible: true, source: "manual" }
          },
          updatedAt: new Date().toISOString()
        };
        return liveState;
      },
      resetHealth: async () => {
        liveState = { ...liveState, health: {}, updatedAt: new Date().toISOString() };
        return liveState;
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await expect(page.locator(".slot-health-controls")).toHaveCount(0);
  await expect(page.locator(".app-nav")).not.toContainText("Beta");
  await expect(page.locator(".app-nav")).not.toContainText("素材");
  await expect(page.locator(".beta-panel")).toHaveCount(0);
});

test("capture window open ignores accidental rapid double click", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "default",
      name: "capture-window-double-click-test",
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
    (window as any).__windowModes = [];
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
      exportPng: async () => "C:/tmp/room.png",
      openObsWindow: async (mode: string) => {
        (window as any).__windowModes.push(mode);
        await new Promise((resolve) => setTimeout(resolve, 80));
      },
      closeObsWindow: async () => undefined,
      revealPath: async () => undefined
    };
  });

  await page.goto("/");
  const openButton = page.locator(".obs-window-button");
  await openButton.dispatchEvent("click");
  await openButton.dispatchEvent("click");

  await expect.poll(() => page.evaluate(() => (window as any).__windowModes as string[])).toEqual(["room"]);
});

test("preview pet scale matches the actual OBS single-team render", async ({ page }) => {
  const svg = (color: string) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="${color}"/></svg>`
    )}`;
  const assets = Array.from({ length: 6 }, (_, index) => ({
    id: `scale-pet-${index}`,
    name: `Scale Pet ${index + 1}`,
    aliases: [],
    element: index % 2 === 0 ? "火" : "水",
    imagePath: svg(index % 2 === 0 ? "#ff6a2a" : "#3aa5ff"),
    updatedAt: "2026-06-18T00:00:00.000Z"
  }));
  const slots = assets.map((asset) => ({ name: asset.name, assetId: asset.id, formAssetId: asset.id }));
  const project = {
    id: "default",
    name: "scale-preview-test",
    teams: {
      left: { label: "Left", slots },
      right: { label: "Right", slots }
    },
    style: {
      resolution: { width: 1920, height: 1080 },
      cardGap: 22,
      imageScale: 1.4,
      cardBackground: "transparent",
      showElementIcon: true
    },
    assetLibrary: { showShiny: false }
  };
  const resolvedProject = {
    ...project,
    assets,
    missingNames: { left: [], right: [] },
    teams: {
      left: {
        label: project.teams.left.label,
        slots: slots.map((slot, index) => ({
          ...slot,
          defeated: false,
          asset: assets[index],
          resolvedElement: assets[index].element,
          formOptions: []
        }))
      },
      right: {
        label: project.teams.right.label,
        slots: slots.map((slot, index) => ({
          ...slot,
          defeated: false,
          asset: assets[index],
          resolvedElement: assets[index].element,
          formOptions: []
        }))
      }
    }
  };

  await page.addInitScript(({ project: initialProject, assets: initialAssets }) => {
    let currentProject = initialProject;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets: initialAssets,
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: "http://127.0.0.1:51735"
      }),
      saveProject: async (nextProject: typeof initialProject) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/left.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: async () => undefined
    };
  }, { project, assets });

  await page.goto("/");
  await page.locator(".preview-switch button").nth(0).click();
  await expect(page.getByTestId("roster-card")).toHaveCount(6);
  const previewGeometry = await page.evaluate(() => {
    const scale = document.querySelector(".output-viewport-scale");
    const art = document.querySelector(".team-rail-left .pet-art")?.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(scale ? getComputedStyle(scale).transform : undefined);
    return {
      width: (art?.width ?? 0) / matrix.a,
      height: (art?.height ?? 0) / matrix.a
    };
  });

  await page.route("**/api/state/default", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(resolvedProject)
    });
  });
  await page.setViewportSize({ width: 420, height: 1080 });
  await page.goto("/overlay/default?mode=left");
  await expect(page.getByTestId("roster-card")).toHaveCount(6);
  const obsGeometry = await page.locator(".team-rail-left .pet-art").first().boundingBox();

  expect(obsGeometry?.width).toBeCloseTo(previewGeometry.width, 0);
  expect(obsGeometry?.height).toBeCloseTo(previewGeometry.height, 0);
});

test("room text can be cleared and text boxes can be deleted by long press", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
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
      },
      assetLibrary: { showShiny: false }
    };
    let currentProject = project;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav").getByRole("button", { name: "装修", exact: true }).click();
  const textArea = page.locator(".room-text-controls textarea");
  await expect(textArea).toBeVisible();
  await textArea.fill("S");
  await textArea.fill("");
  await page.waitForTimeout(420);
  await expect(textArea).toHaveValue("");

  const textItems = page.locator(".room-text-list-item");
  await expect(textItems).toHaveCount(5);
  await textItems.first().scrollIntoViewIfNeeded();
  const firstItemBox = await textItems.first().boundingBox();
  expect(firstItemBox).not.toBeNull();
  await page.mouse.move(firstItemBox!.x + firstItemBox!.width / 2, firstItemBox!.y + firstItemBox!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(760);
  await page.mouse.up();
  await expect(textItems).toHaveCount(4);
});

test("quick import can stage a roster while live sync is off", async ({ page }) => {
  await page.addInitScript(() => {
    const assets = [
      { id: "pet-fire", name: "火神", aliases: [], element: "火", imagePath: "fire.png", updatedAt: "2026-06-15T00:00:00.000Z" },
      { id: "pet-cat", name: "魔力猫", aliases: ["喵喵王"], element: "草", imagePath: "cat.png", updatedAt: "2026-06-15T00:00:00.000Z" },
      { id: "pet-butterfly", name: "化蝶", aliases: [], element: "草/萌", imagePath: "butterfly.png", updatedAt: "2026-06-15T00:00:00.000Z" },
      { id: "pet-blue", name: "水蓝蓝", aliases: [], element: "水", imagePath: "blue.png", updatedAt: "2026-06-15T00:00:00.000Z" },
      { id: "pet-branch", name: "海枝枝（碧蓝珊瑚）", aliases: ["海枝枝"], baseName: "海枝枝", element: "水", imagePath: "branch.png", updatedAt: "2026-06-15T00:00:00.000Z" },
      { id: "pet-lord", name: "烈火战神", aliases: [], baseName: "火神", element: "火", imagePath: "lord.png", updatedAt: "2026-06-15T00:00:00.000Z" }
    ];
    const project = {
      id: "default",
      name: "default",
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      }
    };
    let currentProject = project;
    (window as any).__saveCalls = 0;
    (window as any).__lastSavedProject = undefined;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        (window as any).__lastSavedProject = nextProject;
        (window as any).__saveCalls += 1;
        return nextProject;
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav button").first().click();
  await page.locator(".sync-toggle input").setChecked(false);
  await page.locator(".quick-import-textarea").fill("火神\n魔力猫, 化蝶\n水蓝蓝\n海枝枝\n烈火战神\n火神\n魔力猫");
  await expect(page.locator(".quick-import-match-summary")).toContainText("8/8");
  await expect(page.locator(".quick-import-warning")).toContainText("超过 6 个时会顺延到另一队");
  await page.locator(".quick-import-apply-left").click();

  const leftInputs = page.locator(".team-editor").first().locator(".slot-name-input");
  const rightInputs = page.locator(".team-editor").nth(1).locator(".slot-name-input");
  await expect(leftInputs.nth(0)).toHaveValue("火神");
  await expect(leftInputs.nth(4)).toHaveValue("海枝枝（碧蓝珊瑚）");
  await expect(rightInputs.nth(0)).toHaveValue("火神");
  await expect(rightInputs.nth(1)).toHaveValue("魔力猫");
  await expect.poll(() => page.evaluate(() => (window as any).__saveCalls as number)).toBe(0);

  await page.locator(".sync-now-button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__saveCalls as number)).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__lastSavedProject?.teams.left.slots.map((slot: { name: string }) => slot.name))
    )
    .toEqual(["火神", "魔力猫", "化蝶", "水蓝蓝", "海枝枝（碧蓝珊瑚）", "烈火战神"]);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__lastSavedProject?.teams.right.slots.map((slot: { name: string }) => slot.name))
    )
    .toEqual(["火神", "魔力猫", "", "", "", ""]);

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.locator(".sync-more-actions summary").click();
  await page.locator(".restore-preset-button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__saveCalls as number)).toBe(2);
  await expect(leftInputs.nth(0)).toHaveValue("");
});

test("quick import text stays in memory while switching panels", async ({ page }) => {
  await page.addInitScript(() => {
    const assets = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta"].map((name, index) => ({
      id: `pet-${index}`,
      name,
      aliases: [],
      element: "test",
      imagePath: `${name}.png`,
      updatedAt: "2026-06-15T00:00:00.000Z"
    }));
    const project = {
      id: "default",
      name: "default",
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      }
    };
    let currentProject = project;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        return nextProject;
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  const quickImportText = "Alpha\nBeta,Gamma\nDelta\nEpsilon\nZeta\nEta";
  await page.goto("/");
  await page.locator(".app-nav button").first().click();
  await page.locator(".quick-import-textarea").fill(quickImportText);
  await expect(page.locator(".quick-import-match-summary")).toContainText("7/7");
  await page.locator(".quick-import-apply-left").click();

  await page.locator(".app-nav button").nth(1).click();
  await page.locator(".app-nav button").first().click();
  await expect(page.locator(".quick-import-textarea")).toHaveValue(quickImportText);
});

test("project preset panel can rename, create, and switch persistent presets", async ({ page }) => {
  await page.addInitScript(() => {
    const makeProject = (id: string, name: string) => ({
      id,
      name,
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      }
    });
    let projects = [makeProject("default", "默认项目")];
    let activeProjectId = "default";
    const getActiveProject = () => projects.find((project) => project.id === activeProjectId) ?? projects[0];
    (window as any).__saveCalls = 0;
    (window as any).__activateCalls = 0;
    (window as any).roster = {
      getState: async () => ({
        project: getActiveProject(),
        projects,
        activeProjectId,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: ReturnType<typeof makeProject>) => {
        const index = projects.findIndex((project) => project.id === nextProject.id);
        projects =
          index >= 0
            ? projects.map((project, projectIndex) => (projectIndex === index ? nextProject : project))
            : [...projects, nextProject];
        activeProjectId = nextProject.id;
        (window as any).__saveCalls += 1;
        return nextProject;
      },
      activateProject: async (projectId: string) => {
        activeProjectId = projectId;
        (window as any).__activateCalls += 1;
        return getActiveProject();
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  const nameInput = page.getByLabel("项目名称");
  await nameInput.fill("S2 决赛");
  await page.getByRole("button", { name: "保存" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__saveCalls as number)).toBe(1);
  await expect(page.locator(".project-save-hint")).toHaveText("已保存");
  await expect(page.locator(".project-select")).toHaveValue("default");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".project-save-hint")).toHaveText("没有改动");
  await nameInput.fill(" ");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".project-save-hint")).toHaveText("名称不能为空");
  await expect(nameInput).toHaveValue("S2 决赛");

  await page.getByTitle("新建项目预设").click();
  await expect.poll(() => page.evaluate(() => (window as any).__saveCalls as number)).toBe(2);
  await expect(page.locator(".project-select option")).toHaveCount(2);

  await page.locator(".project-select").selectOption("default");
  await expect.poll(() => page.evaluate(() => (window as any).__activateCalls as number)).toBe(1);
  await expect(nameInput).toHaveValue("S2 决赛");
});

test("project preset panel exports and imports the same preset file format", async ({ page }) => {
  await page.addInitScript(() => {
    const makeProject = (id: string, name: string) => ({
      id,
      name,
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      },
      assetLibrary: { showShiny: false }
    });
    let projects = [makeProject("default", "默认项目")];
    let activeProjectId = "default";
    const getActiveProject = () => projects.find((project) => project.id === activeProjectId) ?? projects[0];
    (window as any).__exportedProjectName = "";
    (window as any).__revealedPath = "";
    (window as any).roster = {
      getState: async () => ({
        project: getActiveProject(),
        projects,
        activeProjectId,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        exportDir: "C:/tmp/rock-roster-test/exports",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: ReturnType<typeof makeProject>) => {
        projects = projects.map((project) => (project.id === nextProject.id ? nextProject : project));
        return nextProject;
      },
      activateProject: async (projectId: string) => {
        activeProjectId = projectId;
        return getActiveProject();
      },
      exportProjectPreset: async (project: ReturnType<typeof makeProject>) => {
        (window as any).__exportedProjectName = project.name;
        return {
          filePath: "C:/tmp/默认项目.rock-roster-preset.json",
          project
        };
      },
      importProjectPreset: async () => {
        const imported = makeProject("synced-project", "同步预设");
        projects = [...projects.filter((project) => project.id !== imported.id), imported];
        activeProjectId = imported.id;
        return {
          filePath: "C:/tmp/同步预设.rock-roster-preset.json",
          project: imported
        };
      },
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: async (filePath: string) => {
        (window as any).__revealedPath = filePath;
      }
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "导出预设" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__exportedProjectName as string)).toBe("默认项目");
  await expect(page.locator(".project-save-hint").filter({ hasText: "预设已导出" })).toBeVisible();
  await page.getByRole("button", { name: "打开位置" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__revealedPath as string)).toBe(
    "C:/tmp/默认项目.rock-roster-preset.json"
  );

  await page.getByRole("button", { name: "导入预设" }).click();
  await expect(page.locator(".project-select")).toHaveValue("synced-project");
  await expect(page.locator(".project-name-edit input")).toHaveValue("同步预设");
  await expect(page.locator(".project-save-hint").filter({ hasText: "已导入：同步预设" })).toBeVisible();
});

test("live workflow guides the full streaming path and keeps critical actions reachable", async ({ page }) => {
  await page.addInitScript(() => {
    const names = ["火神", "魔力猫", "化蝶", "水蓝蓝", "海枝枝（碧蓝珊瑚）", "烈火战神"];
    const assets = names.map((name, index) => ({
      id: `pet-${index}`,
      name,
      aliases: [],
      element: index % 2 === 0 ? "火" : "水",
      imagePath: `pet-${index}.png`,
      updatedAt: "2026-06-16T00:00:00.000Z"
    }));
    const slots = assets.map((asset) => ({ name: asset.name, assetId: asset.id, formAssetId: asset.id }));
    const project = {
      id: "default",
      name: "直播流程测试",
      teams: {
        left: { label: "左队", slots },
        right: { label: "右队", slots }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      }
    };
    (window as any).__copiedText = "";
    (window as any).__exportModes = [];
    (window as any).__windowModes = [];
    (window as any).__revealedPaths = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as any).__copiedText = value;
        }
      }
    });
    (window as any).roster = {
      getState: async () => ({
        project,
        projects: [project],
        activeProjectId: project.id,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: "http://127.0.0.1:51735"
      }),
      saveProject: async (nextProject: typeof project) => nextProject,
      activateProject: async () => project,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async (mode: string) => {
        (window as any).__exportModes.push(mode);
        return `C:/tmp/${mode}.png`;
      },
      openObsWindow: async (mode: string) => {
        (window as any).__windowModes.push(mode);
      },
      closeObsWindow: async () => undefined,
      revealPath: async (filePath: string) => {
        (window as any).__revealedPaths.push(filePath);
      }
    };
  });

  await page.goto("/");
  const nav = page.locator(".app-nav");
  await nav.getByRole("button", { name: "直播", exact: true }).click();
  await expect(page.locator(".live-subsection").first()).toContainText("当前输出");
  await expect(page.locator(".live-readiness-grid")).toContainText("同步：实时");
  await expect(page.locator(".live-readiness-grid")).toContainText("素材：完整");
  await expect(page.getByTestId("live-all-obs")).not.toHaveAttribute("open", "");
  await page.getByTestId("live-all-obs").locator("summary").click();
  await expect(page.locator(".obs-mode-card", { hasText: "左队" })).toContainText("尺寸随当前输出自动适配");
  await expect(page.locator(".obs-mode-card", { hasText: "直播间" })).toContainText("尺寸随当前输出自动适配");

  await nav.getByRole("button", { name: "阵容", exact: true }).click();
  await expect(page.locator(".section-title", { hasText: "阵容设置" })).toBeVisible();

  await nav.getByRole("button", { name: "直播", exact: true }).click();
  await nav.getByRole("button", { name: "装修", exact: true }).click();
  await expect(page.locator(".section-title", { hasText: "直播间装修" })).toBeVisible();

  await nav.getByRole("button", { name: "直播", exact: true }).click();
  await page.locator(".export-section .live-subsection button[title='复制当前 OBS 地址']").click();
  await expect.poll(() => page.evaluate(() => (window as any).__copiedText as string)).toContain("mode=room");

  await page.getByRole("button", { name: "导出当前 PNG" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__exportModes as string[])).toContainEqual("room");
  await expect(page.locator(".top-export-feedback")).toContainText("room.png");
  await page.locator(".top-export-feedback .path-button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__revealedPaths as string[])).toContainEqual("C:/tmp/room.png");
  await expect(page.locator(".export-result")).toContainText("room.png");

  await page.locator(".folder-links .data-link").first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__revealedPaths as string[])).toContainEqual(
    "C:/tmp/rock-roster-test/exports"
  );

  await page.getByTestId("live-all-obs").locator("summary").click();
  await page.locator(".obs-mode-card", { hasText: "双方" }).getByRole("button", { name: "打开双方窗口" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__windowModes as string[])).toContainEqual("overlay");
});

test("team vertical position control moves both roster columns in the live preview", async ({ page }) => {
  await page.addInitScript(() => {
    const names = ["火神", "魔力猫", "化蝶", "水蓝蓝", "海枝枝（碧蓝珊瑚）", "烈火战神"];
    const assets = names.map((name, index) => ({
      id: `pet-${index}`,
      name,
      aliases: [],
      element: index % 2 === 0 ? "火" : "水",
      imagePath: `pet-${index}.png`,
      updatedAt: "2026-06-16T00:00:00.000Z"
    }));
    let currentProject = {
      id: "default",
      name: "上下位置测试",
      teams: {
        left: {
          label: "左队",
          slots: assets.map((asset) => ({ name: asset.name, assetId: asset.id, formAssetId: asset.id }))
        },
        right: {
          label: "右队",
          slots: assets.map((asset) => ({ name: asset.name, assetId: asset.id, formAssetId: asset.id }))
        }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true,
        teamLayout: { centerGap: 1540, verticalOffset: 0 }
      }
    };
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof currentProject) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav").getByRole("button", { name: "阵容", exact: true }).click();
  const leftBefore = await page.locator(".preview-board .team-rail-left").boundingBox();
  const rightBefore = await page.locator(".preview-board .team-rail-right").boundingBox();
  expect(leftBefore).not.toBeNull();
  expect(rightBefore).not.toBeNull();

  const layoutPanel = page.getByTestId("roster-display-tuning");
  await layoutPanel.locator("summary").click();
  const verticalOffsetRange = layoutPanel.locator(".field-row", { hasText: "上下位置" }).locator("input");
  await verticalOffsetRange.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "80");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(layoutPanel.locator("output", { hasText: "80px" })).toBeVisible();
  const transforms = await page.locator(".preview-board .team-rail").evaluateAll((rails) =>
    rails.map((rail) => new DOMMatrixReadOnly(getComputedStyle(rail).transform).m42)
  );
  expect(transforms).toEqual([80, 80]);

  const leftAfter = await page.locator(".preview-board .team-rail-left").boundingBox();
  const rightAfter = await page.locator(".preview-board .team-rail-right").boundingBox();
  expect(leftAfter?.y).toBeGreaterThan((leftBefore?.y ?? 0) + 20);
  expect(rightAfter?.y).toBeGreaterThan((rightBefore?.y ?? 0) + 20);
});

test("name label style sliders preview immediately without publishing every intermediate value", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "default",
      name: "default",
      teams: {
        left: {
          label: "left",
          slots: [{ name: "火神", assetId: "pet-fire", defeated: true }, ...Array.from({ length: 5 }, () => ({ name: "" }))]
        },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
      },
      style: {
        resolution: { width: 1920, height: 1080 },
        cardGap: 14,
        imageScale: 1,
        cardBackground: "transparent",
        showElementIcon: true
      }
    };
    let currentProject = project;
    (window as any).__saveCalls = 0;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets: [
          {
            id: "pet-fire",
            name: "火神",
            aliases: [],
            element: "火",
            imagePath: "fire.png",
            updatedAt: "2026-06-15T00:00:00.000Z"
          }
        ],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        currentProject = nextProject;
        (window as any).__saveCalls += 1;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav button").first().click();
  const cardPanel = page.getByTestId("roster-display-tuning");
  await cardPanel.locator("summary").click();
  const defeatedGrayRange = cardPanel.locator("label.field-row", { hasText: "战败灰度" }).locator("input[type='range']");
  const defeatedOpacityRange = cardPanel.locator("label.field-row", { hasText: "战败透明" }).locator("input[type='range']");

  for (const [locator, values] of [
    [defeatedGrayRange, [0.8, 0.6, 0.4, 0.2]],
    [defeatedOpacityRange, [0.5, 0.4, 0.3, 0.25]]
  ] as const) {
    for (const value of values) {
      await locator.evaluate((node, nextValue) => {
        const input = node as HTMLInputElement;
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(input, String(nextValue));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
    }
  }

  await expect(cardPanel.locator("output", { hasText: "20%" })).toBeVisible();
  await expect(cardPanel.locator("output", { hasText: "25%" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".preview-board .overlay-scene").evaluate((node) => {
        const style = getComputedStyle(node as HTMLElement);
        return {
          grayscale: style.getPropertyValue("--defeat-grayscale").trim(),
          opacity: style.getPropertyValue("--defeat-opacity").trim()
        };
      })
    )
    .toEqual({ grayscale: "0.2", opacity: "0.25" });

  const stylePanel = page.getByTestId("roster-name-style");
  await stylePanel.locator("summary").click();
  const ranges = stylePanel.locator("input[type='range']");
  const fontSizeRange = ranges.nth(0);
  const labelHeightRange = ranges.nth(2);
  const minWidthRange = ranges.nth(4);

  for (const [locator, values] of [
    [fontSizeRange, [16, 18, 20, 22]],
    [labelHeightRange, [28, 32, 36, 40]],
    [minWidthRange, [96, 120, 144, 168]]
  ] as const) {
    for (const value of values) {
      await locator.evaluate((node, nextValue) => {
        const input = node as HTMLInputElement;
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(input, String(nextValue));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
    }
  }

  await expect(stylePanel.locator("output", { hasText: "22px" })).toBeVisible();
  await expect(stylePanel.locator("output", { hasText: "40px" })).toBeVisible();
  await expect(stylePanel.locator("output", { hasText: "168px" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__saveCalls as number)).toBeLessThanOrEqual(1);
});

test("range controls show progress and reach both endpoints while preview updates", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "default",
      name: "default",
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
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
    let currentProject = project;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets: [],
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof project) => {
        currentProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".app-nav button").first().click();

  const displayTuning = page.getByTestId("roster-display-tuning");
  await displayTuning.locator("summary").click();
  const firstRangeRow = displayTuning.locator("label.field-row", { has: page.locator("input.range-input") }).first();
  const range = firstRangeRow.locator("input.range-input");
  const output = firstRangeRow.locator("output");
  await expect(range).toHaveValue("14");
  await expect(output).toHaveText("14px");
  await expect(range).toHaveCSS("--range-progress", "19.444444444444446%");

  const dragRangeTo = async (ratio: number) => {
    await range.scrollIntoViewIfNeeded();
    const box = await range.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }
    const x = box.x + Math.max(1, Math.min(box.width - 1, box.width * ratio));
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
  };

  await dragRangeTo(0);
  await expect(range).toHaveValue("0");
  await expect(output).toHaveText("0px");
  await expect(range).toHaveCSS("--range-progress", "0%");
  await expect
    .poll(() =>
      page.locator(".preview-board .overlay-scene").evaluate((node) =>
        getComputedStyle(node as HTMLElement).getPropertyValue("--card-gap").trim()
      )
    )
    .toBe("0px");

  await dragRangeTo(1);
  await expect(range).toHaveValue("72");
  await expect(output).toHaveText("72px");
  await expect(range).toHaveCSS("--range-progress", "100%");
  await expect
    .poll(() =>
      page.locator(".preview-board .overlay-scene").evaluate((node) =>
        getComputedStyle(node as HTMLElement).getPropertyValue("--card-gap").trim()
      )
    )
    .toBe("72px");
});

test("asset library hides shiny assets by default and saves the project toggle", async ({ page }) => {
  await page.addInitScript(() => {
    const assets = [
      {
        id: "pet-fire",
        name: "火神",
        aliases: [],
        element: "火",
        imagePath: "fire.png",
        updatedAt: "2026-06-17T00:00:00.000Z"
      },
      {
        id: "pet-cat",
        name: "魔力猫",
        aliases: [],
        element: "草",
        imagePath: "cat.png",
        updatedAt: "2026-06-17T00:00:00.000Z"
      },
      {
        id: "pet-didi",
        name: "霹雳迪迪",
        aliases: [],
        element: "电",
        imagePath: "didi.png",
        baseName: "霹雳迪迪",
        chainKey: "didi",
        updatedAt: "2026-06-17T00:00:00.000Z"
      },
      {
        id: "pet-shiny",
        name: "霹雳迪迪（异色）",
        aliases: [],
        element: "电",
        imagePath: "shiny.png",
        baseName: "霹雳迪迪",
        chainKey: "didi",
        formLabel: "异色",
        updatedAt: "2026-06-17T00:00:00.000Z"
      }
    ];
    let currentProject = {
      id: "default",
      name: "default",
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
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
    (window as any).__lastSavedProject = undefined;
    (window as any).roster = {
      getState: async () => ({
        project: currentProject,
        projects: [currentProject],
        activeProjectId: currentProject.id,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async (nextProject: typeof currentProject) => {
        currentProject = nextProject;
        (window as any).__lastSavedProject = nextProject;
        return nextProject;
      },
      activateProject: async () => currentProject,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  const firstSlot = page.locator(".team-editor").first().locator(".slot-name-input").first();
  await firstSlot.fill("霹雳迪");
  await expect(page.locator(".suggestion-popover")).toContainText("霹雳迪迪");
  await expect(page.locator(".suggestion-popover")).not.toContainText("异色");
  await page.locator(".suggestion-item").first().click();
  const firstFormSelect = page.locator(".team-editor").first().locator(".form-select").first();
  await expect(firstFormSelect).toContainText("默认");
  await expect(firstFormSelect).not.toContainText("异色");

  await page.locator(".quick-import-textarea").fill("霹雳迪迪（异色）");
  await expect(page.locator(".quick-import-match-summary")).toContainText("0/1");

  await page.locator(".system-status-panel").getByRole("button", { name: /素材库/ }).click();
  await expect(page.locator(".asset-shiny-toggle")).toContainText("默认隐藏");
  await page.locator(".asset-search").fill("异色");
  await expect(page.locator(".asset-row")).toHaveCount(0);
  await expect(page.locator(".empty-assets")).toBeVisible();

  await page.locator(".asset-shiny-toggle input").setChecked(true);
  await expect(page.locator(".asset-shiny-toggle")).toContainText("已包含");
  await expect(page.locator(".asset-row strong")).toContainText(["霹雳迪迪（异色）"]);
  await page.locator(".app-nav").getByRole("button", { name: "阵容", exact: true }).click();
  await expect(firstFormSelect).toContainText("异色");
  await page.locator(".quick-import-textarea").fill("霹雳迪迪（异色）");
  await expect(page.locator(".quick-import-match-summary")).toContainText("1/1");
  await firstSlot.fill("异色");
  await expect(page.locator(".suggestion-popover")).toContainText("霹雳迪迪（异色）");
  await expect
    .poll(() => page.evaluate(() => (window as any).__lastSavedProject?.assetLibrary?.showShiny))
    .toBe(true);
});

test("asset library keeps thumbnail DOM bounded while browsing the full library", async ({ page }) => {
  await page.addInitScript(() => {
    const assets = Array.from({ length: 240 }, (_, index) => {
      const displayIndex = index + 1;
      return {
        id: `pet-${displayIndex}`,
        name: `测试精灵 ${String(displayIndex).padStart(3, "0")}`,
        aliases: [],
        element: displayIndex % 2 === 0 ? "水" : "火",
        imagePath: `pet-${displayIndex}.png`,
        updatedAt: "2026-06-17T00:00:00.000Z"
      };
    });
    const project = {
      id: "default",
      name: "default",
      teams: {
        left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
        right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
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
    (window as any).roster = {
      getState: async () => ({
        project,
        projects: [project],
        activeProjectId: project.id,
        assets,
        dataDir: "C:/tmp/rock-roster-test",
        serverUrl: window.location.origin
      }),
      saveProject: async () => project,
      activateProject: async () => project,
      onStateChanged: () => () => undefined,
      importAssets: async () => undefined,
      importBackground: async () => undefined,
      exportPng: async () => "C:/tmp/team-overlay.png",
      openObsWindow: async () => undefined,
      closeObsWindow: async () => undefined,
      revealPath: () => undefined
    };
  });

  await page.goto("/");
  await page.locator(".system-status-panel").getByRole("button", { name: /素材库/ }).click();
  await expect(page.locator(".asset-list .small-note")).toContainText("已显示 48/240");
  expect(await page.locator(".asset-row").count()).toBeLessThanOrEqual(48);

  const results = page.locator(".asset-results");
  for (let index = 0; index < 6; index += 1) {
    await results.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(30);
  }

  await expect(page.locator(".asset-list .small-note")).toContainText("已显示 240/240");
  expect(await page.locator(".asset-row").count()).toBeLessThanOrEqual(64);
  await expect(page.locator(".asset-row strong")).toContainText(["测试精灵 240"]);

  await page.evaluate(() => window.dispatchEvent(new Event("rock-roster-release-memory")));
  await expect(page.locator(".asset-list .small-note")).toContainText("已显示 48/240");
  expect(await page.locator(".asset-row").count()).toBeLessThanOrEqual(48);
});
