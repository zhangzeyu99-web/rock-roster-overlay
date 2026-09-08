import { chromium } from "playwright";
import { PNG } from "pngjs";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageInfo = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const releaseDir = process.env.ROSTER_RELEASE_DIR
  ? path.resolve(root, process.env.ROSTER_RELEASE_DIR)
  : path.join(root, "release");
const exePath = path.join(releaseDir, "win-unpacked", "阵容叠加器.exe");
const evidenceDir = path.join(root, "release-evidence", `v${packageInfo.version}`);
const debugPort = 9339;
const cdpUrl = `http://127.0.0.1:${debugPort}`;

await fs.mkdir(evidenceDir, { recursive: true });

const appProcess = spawn(exePath, [`--remote-debugging-port=${debugPort}`, ...(process.env.ROSTER_QA_USER_DATA ? [`--user-data-dir=${process.env.ROSTER_QA_USER_DATA}`] : [])], {
  cwd: path.dirname(exePath),
  stdio: "ignore",
  windowsHide: false
});

let browser;
let obsBrowser;
let gui;
let originalProject;
const checks = [];

try {
  await waitForCdp(cdpUrl);
  browser = await chromium.connectOverCDP(cdpUrl);
  gui = await waitForPage(browser, (page) => page.url().startsWith("file:"));
  await gui.waitForSelector(".app-shell", { timeout: 30000 });
  await gui.setViewportSize({ width: 1440, height: 900 });

  const state = await gui.evaluate(() => window.roster.getState());
  originalProject = structuredClone(state.project);
  if (!state.assets || state.assets.length < 12) {
    throw new Error(`not enough assets for packaged verification: ${state.assets?.length ?? 0}`);
  }

  checks.push(["desktop version", await gui.locator(".brand").textContent()]);
  checks.push(["top action buttons", await gui.locator(".top-actions button").count()]);

  const project = normalizeDemoProject(state.project, state.assets);
  await gui.evaluate((nextProject) => window.roster.saveProject(nextProject), project);
  await gui.waitForTimeout(500);
  await assertPreviewCanvasRatio(gui);
  checks.push(["preview canvas ratio", "16:9"]);
  await assertPreviewLabelsReadable(gui);
  checks.push(["preview labels readable", "ok"]);

  await gui.locator(".app-nav").getByRole("button", { name: "直播", exact: true }).click();
  await gui.waitForSelector("[data-testid='current-capture-toggle']");
  if ((await gui.locator(".top-obs-url").count()) !== 0) {
    throw new Error("duplicated top OBS URL is still visible");
  }
  await gui.getByTestId("current-capture-toggle").click();
  await gui.waitForFunction(async () => {
    const state = await window.roster.getObsWindowState();
    return state.open && state.mode === "room";
  });
  await gui.waitForFunction(
    () => document.querySelector("[data-testid='current-capture-toggle']")?.textContent?.includes("关闭采集窗口")
  );
  await gui.getByTestId("current-capture-toggle").click();
  await gui.waitForFunction(async () => !(await window.roster.getObsWindowState()).open);
  checks.push(["live capture window toggle", "open, state sync, close"]);

  await gui.locator(".system-status-panel").getByRole("button", { name: /素材库/ }).click();
  await gui.waitForSelector(".asset-search", { timeout: 30000 });
  await gui.locator(".asset-search").fill("");
  const initialAssetNote = await gui.locator(".asset-list .small-note").textContent();
  const initialRows = await gui.locator(".asset-row").count();
  for (let index = 0; index < 3; index += 1) {
    await gui.locator(".asset-results").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await gui.waitForTimeout(80);
  }
  await gui.waitForFunction(
    (initial) => document.querySelector(".asset-list .small-note")?.textContent !== initial,
    initialAssetNote
  );
  const mountedRows = await gui.locator(".asset-row").count();
  const loadedAssetNote = await gui.locator(".asset-list .small-note").textContent();
  if (mountedRows > 48) {
    throw new Error(`asset library mounted too many thumbnail rows: ${mountedRows}`);
  }
  checks.push(["asset virtual rows", `${initialRows}->${mountedRows}; ${loadedAssetNote?.trim()}`]);

  const globalTarget = state.assets.find((asset, index) => index >= 48 && asset.name.includes("海枝枝")) ?? state.assets[80];
  const searchText = globalTarget.baseName || globalTarget.name.replace(/[（(].*?[）)]/g, "");
  await gui.locator(".asset-search").fill(searchText);
  await gui.waitForFunction(
    (query) =>
      [...document.querySelectorAll(".asset-row strong")].some((node) =>
        node.textContent?.includes(query)
      ),
    searchText
  );
  checks.push(["global search target", globalTarget.name]);

  const inputAssetName = await gui.locator(".asset-row strong").first().textContent();
  await gui.locator(".app-nav").getByRole("button", { name: "阵容", exact: true }).click();
  await gui.waitForSelector(".team-editor input", { timeout: 30000 });
  await ensureDetailsOpen(gui, "roster-name-style");
  checks.push(["preset cards", await gui.locator(".preset-card").count()]);
  await gui.locator(".team-editor input").first().fill(inputAssetName);
  await gui.locator(".team-editor input").first().blur();
  await gui.waitForFunction(
    (name) => document.querySelector(".team-editor input")?.value === name,
    inputAssetName
  );
  checks.push(["slot text input", inputAssetName]);

  await gui.locator(".preset-card").nth(0).click();
  await gui.waitForFunction(
    () => {
      const style = getComputedStyle(document.querySelector(".pet-name-bar"));
      return style.borderTopWidth === "0px" && style.color === "rgb(255, 255, 255)";
    }
  );
  checks.push(["default label style", "no border, white text"]);

  obsBrowser = await chromium.launch();
  const obsPage = await obsBrowser.newPage({ viewport: { width: 420, height: 1080 } });
  await obsPage.goto(`${state.serverUrl}/overlay/default?mode=left`, { waitUntil: "domcontentloaded" });
  await obsPage.waitForSelector(".roster-card");
  await waitForPetImages(obsPage, 6);
  const leftObsPath = path.join(evidenceDir, "obs-left-source.png");
  const leftObsBuffer = await obsPage.screenshot({ path: leftObsPath, omitBackground: true });
  assertNonTransparentRatio(leftObsBuffer, "obs left source", 0.1);
  await assertSingleTeamLayout(obsPage);
  await assertSingleTeamSafeArea(obsPage, ".team-rail-left");
  await assertElementIconGeometry(obsPage);
  checks.push(["obs left cards", await obsPage.locator(".roster-card").count()]);
  checks.push(["obs left layout", "live safe area, separated art boxes, icon diameter equals label height"]);

  const obsRightPage = await obsBrowser.newPage({ viewport: { width: 420, height: 1080 } });
  await obsRightPage.goto(`${state.serverUrl}/overlay/default?mode=right`, { waitUntil: "domcontentloaded" });
  await obsRightPage.waitForSelector(".roster-card");
  await waitForPetImages(obsRightPage, 6);
  const rightObsPath = path.join(evidenceDir, "obs-right-source.png");
  const rightObsBuffer = await obsRightPage.screenshot({ path: rightObsPath, omitBackground: true });
  assertNonTransparentRatio(rightObsBuffer, "obs right source", 0.1);
  await assertSingleTeamSafeArea(obsRightPage, ".team-rail-right");
  checks.push(["obs right cards", await obsRightPage.locator(".roster-card").count()]);

  await gui.locator(".preset-card").nth(3).click();
  await obsPage.waitForFunction(
    () => getComputedStyle(document.querySelector(".pet-name-bar")).color === "rgb(255, 246, 223)"
  );
  checks.push(["obs live preset refresh", "league-night"]);
  await gui.locator(".preset-card").nth(0).click();
  await obsPage.waitForFunction(
    () => getComputedStyle(document.querySelector(".pet-name-bar")).color === "rgb(255, 255, 255)"
  );
  checks.push(["obs live preset restore", "world-battle"]);

  const obsBothPage = await obsBrowser.newPage({ viewport: { width: 1920, height: 1080 } });
  await obsBothPage.goto(`${state.serverUrl}/overlay/default?mode=overlay`, { waitUntil: "domcontentloaded" });
  await obsBothPage.waitForSelector(".roster-card");
  await waitForPetImages(obsBothPage, 12);
  const obsPath = path.join(evidenceDir, "obs-both-source.png");
  const obsBuffer = await obsBothPage.screenshot({ path: obsPath, omitBackground: true });
  assertTransparentCenter(obsBuffer, "obs browser source");
  assertNonTransparentRatio(obsBuffer, "obs browser source", 0.04);
  await assertOverlayLiveSafeArea(obsBothPage);
  checks.push(["obs both cards", await obsBothPage.locator(".roster-card").count()]);
  checks.push(["obs both live safe area", "top/bottom bands clear, center transparent"]);

  const project1440 = structuredClone(project);
  project1440.style = {
    ...project1440.style,
    resolution: { width: 2560, height: 1440 }
  };
  await gui.evaluate((nextProject) => window.roster.saveProject(nextProject), project1440);
  await gui.waitForTimeout(500);
  const obsBothPage1440 = await obsBrowser.newPage({ viewport: { width: 2560, height: 1440 } });
  await obsBothPage1440.goto(`${state.serverUrl}/overlay/default?mode=overlay`, { waitUntil: "domcontentloaded" });
  await obsBothPage1440.waitForSelector(".roster-card");
  await waitForPetImages(obsBothPage1440, 12);
  const obs1440Path = path.join(evidenceDir, "obs-both-source-1440p.png");
  const obs1440Buffer = await obsBothPage1440.screenshot({ path: obs1440Path, omitBackground: true });
  assertTransparentCenter(obs1440Buffer, "obs browser source 1440p");
  assertNonTransparentRatio(obs1440Buffer, "obs browser source 1440p", 0.04);
  await assertOverlayLiveSafeArea(obsBothPage1440);
  checks.push(["obs both 1440p screenshot", obs1440Path]);
  await gui.evaluate((nextProject) => window.roster.saveProject(nextProject), project);
  await gui.waitForTimeout(500);

  const obsRoomPage = await obsBrowser.newPage({ viewport: { width: 1920, height: 1080 } });
  await obsRoomPage.goto(`${state.serverUrl}/overlay/default?mode=room`, { waitUntil: "domcontentloaded" });
  await obsRoomPage.waitForSelector(".room-scene");
  await obsRoomPage.waitForSelector(".roster-card");
  await waitForPetImages(obsRoomPage, 12);
  await assertRoomTextDoesNotOverlapRoster(obsRoomPage);
  const titleTextureResponse = await obsRoomPage.locator(".room-text-title span").evaluate(async (node) => {
    const backgroundImage = getComputedStyle(node, "::after").backgroundImage;
    const textureUrl = backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (!textureUrl) {
      return { url: "", status: 0, contentType: "", length: 0 };
    }
    const response = await fetch(textureUrl, { cache: "no-store" });
    return {
      url: textureUrl,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      length: (await response.arrayBuffer()).byteLength
    };
  });
  if (
    titleTextureResponse.status !== 200 ||
    !titleTextureResponse.contentType.startsWith("image/png") ||
    !titleTextureResponse.url.includes("s3-clover-colored-pencil-fill.png") ||
    titleTextureResponse.length < 1000
  ) {
    throw new Error(`packaged S3 title texture unavailable: ${JSON.stringify(titleTextureResponse)}`);
  }
  const roomObsPath = path.join(evidenceDir, "obs-room-source.png");
  const roomObsBuffer = await obsRoomPage.screenshot({ path: roomObsPath, omitBackground: false });
  const titleAccentPixels = assertS3ColoredPencilAccent(roomObsBuffer);
  checks.push(["obs room no text-roster overlap", "ok"]);
  checks.push(["obs room S3 texture response", titleTextureResponse]);
  checks.push(["obs room S3 colored-pencil accents", titleAccentPixels]);

  const exportPath = await gui.evaluate(() => window.roster.exportPng("overlay"));
  const exportBuffer = await fs.readFile(exportPath);
  const exportPng = PNG.sync.read(exportBuffer);
  if (exportPng.width !== 1920 || exportPng.height !== 1080) {
    throw new Error(`export size mismatch: ${exportPng.width}x${exportPng.height}`);
  }
  assertTransparentCenter(exportBuffer, "export png");
  assertNonTransparentRatio(exportBuffer, "export png", 0.05);
  checks.push(["png export", exportPath]);

  const leftExportPath = await gui.evaluate(() => window.roster.exportPng("left"));
  const leftExportBuffer = await fs.readFile(leftExportPath);
  const leftExportPng = PNG.sync.read(leftExportBuffer);
  if (leftExportPng.width !== 420 || leftExportPng.height !== 1080) {
    throw new Error(`left export size mismatch: ${leftExportPng.width}x${leftExportPng.height}`);
  }
  assertNonTransparentRatio(leftExportBuffer, "left png export", 0.06);
  checks.push(["left png export", leftExportPath]);

  await gui.evaluate(() => window.roster.openObsWindow("overlay"));
  const capturePage = await waitForPage(browser, (page) => page.url().includes("capture=window"));
  await capturePage.waitForSelector(".roster-card", { timeout: 30000 });
  await waitForPetImages(capturePage, 12);
  const windowPath = path.join(evidenceDir, "obs-transparent-window.png");
  const windowBuffer = await capturePage.screenshot({ path: windowPath, omitBackground: true });
  assertTransparentCenter(windowBuffer, "transparent window");
  assertNonTransparentRatio(windowBuffer, "transparent window", 0.04);
  checks.push(["transparent window cards", await capturePage.locator(".roster-card").count()]);

  await gui.evaluate(() => window.roster.openControlWindow());
  const controlPage = await waitForPage(
    browser,
    (page) => page.url().includes("/control") || page.url().includes("#/control")
  );
  await controlPage.waitForSelector(".floating-control-shell", { timeout: 30000 });
  const controlStats = await controlPage.evaluate(() => ({
    formTriggers: document.querySelectorAll(".floating-form-trigger").length,
    nativeSelects: document.querySelectorAll(".floating-slot-row select").length,
    defeatedCheckboxes: document.querySelectorAll(".floating-defeated input[type='checkbox']").length,
    matchInputs: document.querySelectorAll(".floating-match input").length,
    settingsButtons: document.querySelectorAll(".floating-settings-button").length,
    iconTextCount: document.querySelectorAll(".floating-window-actions button span").length,
    panelBounds: (() => {
      const rect = document.querySelector(".floating-control-shell")?.getBoundingClientRect();
      if (!rect) {
        return null;
      }
      return {
        left: rect.left,
        top: rect.top,
        rightGutter: window.innerWidth - rect.right,
        bottomGutter: window.innerHeight - rect.bottom
      };
    })(),
    actionButtons: document.querySelectorAll(".floating-control-shell button").length,
    actionLabels: Array.from(document.querySelectorAll(".floating-control-shell button")).map((button) =>
      `${button.textContent ?? ""} ${button.getAttribute("title") ?? ""}`.trim()
    )
  }));
  const requiredControlLabels = ["置顶", "最小化", "关闭", "填左队", "填右队"];
  requiredControlLabels.splice(0, requiredControlLabels.length, "设置", "置顶", "关闭", "填左队", "填右队");
  const missingControlLabels = requiredControlLabels.filter(
    (label) => !controlStats.actionLabels.some((actionLabel) => actionLabel.includes(label))
  );
  if (
    controlStats.formTriggers < 12 ||
    controlStats.nativeSelects !== 0 ||
    controlStats.defeatedCheckboxes < 12 ||
    controlStats.matchInputs < 4 ||
    controlStats.settingsButtons !== 1 ||
    controlStats.iconTextCount !== 0 ||
    !controlStats.panelBounds ||
    controlStats.panelBounds.left !== 0 ||
    controlStats.panelBounds.top !== 0 ||
    controlStats.panelBounds.rightGutter !== 0 ||
    controlStats.panelBounds.bottomGutter !== 0 ||
    controlStats.actionButtons < requiredControlLabels.length ||
    missingControlLabels.length > 0
  ) {
    throw new Error(
      `floating control incomplete: ${JSON.stringify({ ...controlStats, missingControlLabels })}`
    );
  }
  await controlPage.locator(".floating-settings-button").click();
  await controlPage.waitForSelector(".floating-settings-popover", { timeout: 5000 });
  const settingStats = await controlPage.evaluate(() => ({
    rangeInputs: document.querySelectorAll(".floating-settings-popover input[type='range']").length,
    checkboxInputs: document.querySelectorAll(".floating-settings-popover input[type='checkbox']").length,
    text: document.querySelector(".floating-settings-popover")?.textContent ?? ""
  }));
  if (
    settingStats.rangeInputs < 2 ||
    settingStats.checkboxInputs < 1 ||
    !settingStats.text.includes("玻璃强度") ||
    !settingStats.text.includes("界面大小")
  ) {
    throw new Error(`floating settings incomplete: ${JSON.stringify(settingStats)}`);
  }
  await controlPage.locator(".floating-settings-button").click();
  await controlPage.locator(".floating-team-left .floating-defeated input").first().check();
  await obsBothPage.waitForFunction(() =>
    document.querySelector(".team-rail-left .roster-card")?.classList.contains("roster-card-defeated")
  );
  await controlPage.locator(".floating-team-left .floating-defeated input").first().uncheck();
  await obsBothPage.waitForFunction(
    () => !document.querySelector(".team-rail-left .roster-card")?.classList.contains("roster-card-defeated")
  );
  const floatingControlPath = path.join(evidenceDir, "floating-control.png");
  await controlPage.screenshot({ path: floatingControlPath, fullPage: true });
  checks.push(["floating control controls", controlStats]);
  checks.push(["floating control settings", settingStats]);
  checks.push(["floating control obs sync", "defeated toggle ok"]);

  const guiPath = path.join(evidenceDir, "desktop-gui.png");
  await gui.screenshot({ path: guiPath, fullPage: true });
  checks.push(["gui screenshot", guiPath]);
  checks.push(["obs left screenshot", leftObsPath]);
  checks.push(["obs right screenshot", rightObsPath]);
  checks.push(["obs both screenshot", obsPath]);
  checks.push(["obs room screenshot", roomObsPath]);
  checks.push(["window screenshot", windowPath]);
  checks.push(["floating control screenshot", floatingControlPath]);

  await gui.evaluate(() => window.roster.closeObsWindow());

  await fs.writeFile(
    path.join(evidenceDir, `verify-packaged-v${packageInfo.version.replaceAll(".", "")}.json`),
    JSON.stringify({ checks }, null, 2),
    "utf8"
  );
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally {
  if (gui && originalProject && !gui.isClosed()) {
    await gui.evaluate((project) => window.roster.saveProject(project), originalProject).catch(() => undefined);
    await gui.waitForTimeout(300).catch(() => undefined);
  }
  await obsBrowser?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (appProcess.pid) {
    await killTree(appProcess.pid).catch(() => appProcess.kill());
  }
}

function normalizeDemoProject(project, assets) {
  const next = structuredClone(project);
  const leftAssets = assets.slice(0, 6);
  const rightAssets = assets.slice(6, 12);
  next.teams.left.slots = leftAssets.map((asset) => ({
    name: asset.name,
    assetId: asset.id,
    formAssetId: asset.id,
    element: asset.element,
    defeated: false
  }));
  next.teams.right.slots = rightAssets.map((asset) => ({
    name: asset.name,
    assetId: asset.id,
    formAssetId: asset.id,
    element: asset.element,
    defeated: false
  }));
  next.style = {
    ...next.style,
    resolution: { width: 1920, height: 1080 },
    cardGap: 8,
    imageScale: 0.96,
    cardBackground: "transparent",
    cloudTheme: "s3",
    cardPlateScale: 1.02,
    cardPlateYOffset: 22,
    showElementIcon: true,
    teamLayout: { mode: "curved", centerGap: 1540, verticalOffset: 0 },
    nameLabel: {
      presetId: "world-battle"
    }
  };
  next.room = {
    mode: "competition",
    background: {
      visible: true,
      imagePath: "builtin:world-room-v3",
      fit: "cover",
      opacity: 1,
      dim: 0.12
    },
    guides: { visible: false, mode: "safe" },
    textBoxes: [
      createRoomTextBox("room-title", "title", "S3·铅字幻梦", 480, 22, 960, 92, 66, 900),
      createRoomTextBox("room-player-left", "player-left", "左侧选手", 430, 132, 330, 58, 36, 850),
      createRoomTextBox("room-player-right", "player-right", "右侧选手", 1160, 132, 330, 58, 36, 850),
      createRoomTextBox("room-score-left", "score-left", "9", 310, 94, 100, 104, 86, 950),
      createRoomTextBox("room-score-right", "score-right", "1", 1510, 94, 100, 104, 86, 950)
    ]
  };
  return next;
}

function createRoomTextBox(id, role, text, x, y, width, height, fontSize, fontWeight) {
  return {
    id,
    role,
    text,
    x,
    y,
    width,
    height,
    fontFamily: '"MiSans", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
    fontSize,
    fontWeight,
    color: "#ffffff",
    background: "transparent",
    borderColor: "transparent",
    borderWidth: 0,
    radius: 0,
    align: "center",
    opacity: 1
  };
}

async function waitForCdp(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error("timed out waiting for Electron CDP");
}

async function waitForPage(browser, predicate) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (predicate(page)) {
          return page;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("timed out waiting for target page");
}

async function waitForPetImages(page, expectedCount) {
  await page.waitForFunction(
    (count) => {
      const images = [...document.querySelectorAll("img.pet-art")];
      return (
        images.length >= count &&
        images.every((image) => image.complete && image.naturalWidth > 0)
      );
    },
    expectedCount,
    { timeout: 30000 }
  );
  await page.waitForTimeout(300);
}

async function ensureDetailsOpen(page, testId) {
  const details = page.getByTestId(testId);
  await details.scrollIntoViewIfNeeded();
  if (!(await details.evaluate((node) => node.open))) {
    await details.locator("summary").click();
  }
  await page.waitForFunction((id) => document.querySelector(`[data-testid="${id}"]`)?.open === true, testId);
}

async function assertPreviewLabelsReadable(page) {
  const issues = await page.evaluate(() => {
    const board = document.querySelector(".preview-board")?.getBoundingClientRect();
    return [...document.querySelectorAll(".preview-board .pet-name-bar")]
      .map((bar) => {
        const name = bar.querySelector(".pet-name");
        const rect = bar.getBoundingClientRect();
        const textClipped = name ? name.scrollWidth > name.clientWidth + 1 : false;
        const outOfBoard = board
          ? rect.top < board.top - 1 ||
            rect.left < board.left - 1 ||
            rect.right > board.right + 1 ||
            rect.bottom > board.bottom + 1
          : false;
        return {
          text: name?.textContent ?? "",
          textClipped,
          outOfBoard
        };
      })
      .filter((item) => item.textClipped || item.outOfBoard);
  });
  if (issues.length > 0) {
    throw new Error(`preview labels invalid: ${JSON.stringify(issues)}`);
  }
}

async function assertPreviewCanvasRatio(page) {
  const geometry = await page.locator(".preview-board .output-viewport-frame").evaluate((node) => {
    const frame = node.getBoundingClientRect();
    const scaled = node.querySelector(".output-viewport-scale");
    const matrix = new DOMMatrixReadOnly(getComputedStyle(scaled).transform);
    return {
      width: frame.width,
      height: frame.height,
      ratio: frame.width / frame.height,
      scale: matrix.a,
      expectedScale: frame.width / 1920
    };
  });

  if (
    Math.abs(geometry.ratio - 16 / 9) > 0.002 ||
    Math.abs(geometry.scale - geometry.expectedScale) > 0.002
  ) {
    throw new Error(`preview canvas ratio invalid: ${JSON.stringify(geometry)}`);
  }
}

async function assertRoomTextDoesNotOverlapRoster(page) {
  const issues = await page.evaluate(() => {
    const textNodes = [...document.querySelectorAll(".room-text-box")].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        role: node.getAttribute("data-role") ?? "room-text",
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };
    });
    const rosterNodes = [...document.querySelectorAll(".roster-card")].map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        index,
        side: node.getAttribute("data-side") ?? "",
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };
    });
    return textNodes.flatMap((text) =>
      rosterNodes
        .filter((card) => intersects(text, card))
        .map((card) => ({
          textRole: text.role,
          cardSide: card.side,
          cardIndex: card.index
        }))
    );

    function intersects(a, b) {
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }
  });

  if (issues.length > 0) {
    throw new Error(`room text overlaps roster: ${JSON.stringify(issues)}`);
  }
}

async function assertSingleTeamLayout(page) {
  const rects = await page.locator(".team-rail-left .pet-art").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      })
      .sort((a, b) => a.top - b.top)
  );

  for (let index = 0; index < rects.length - 1; index += 1) {
    if (rects[index].bottom > rects[index + 1].top + 1) {
      throw new Error(`left team art overlaps between slot ${index + 1} and ${index + 2}`);
    }
  }
}

async function assertSingleTeamSafeArea(page, railSelector) {
  const geometry = await page.locator(`${railSelector} .roster-card`).evaluateAll((nodes) => {
    const rects = nodes.map((node) => node.getBoundingClientRect());
    return {
      height: window.innerHeight,
      minTop: Math.min(...rects.map((rect) => rect.top)),
      maxBottom: Math.max(...rects.map((rect) => rect.bottom))
    };
  });

  if (geometry.minTop < geometry.height * 0.075) {
    throw new Error(
      `${railSelector} starts too high for the live safe area: top=${geometry.minTop}, height=${geometry.height}`
    );
  }

  if (geometry.maxBottom > geometry.height * 0.91) {
    throw new Error(
      `${railSelector} ends too low for the live safe area: bottom=${geometry.maxBottom}, height=${geometry.height}`
    );
  }
}

async function assertOverlayLiveSafeArea(page) {
  const geometry = await page.evaluate(() => {
    const leftCards = [...document.querySelectorAll(".team-rail-left .roster-card")].map((node) =>
      node.getBoundingClientRect()
    );
    const rightCards = [...document.querySelectorAll(".team-rail-right .roster-card")].map((node) =>
      node.getBoundingClientRect()
    );
    const allCards = [...leftCards, ...rightCards];
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      minTop: Math.min(...allCards.map((rect) => rect.top)),
      maxBottom: Math.max(...allCards.map((rect) => rect.bottom)),
      leftSafeRight: Math.max(...leftCards.map((rect) => rect.right)),
      rightSafeLeft: Math.min(...rightCards.map((rect) => rect.left))
    };
  });

  if (geometry.minTop < geometry.height * 0.085) {
    throw new Error(`overlay starts too high for live safe area: ${JSON.stringify(geometry)}`);
  }

  if (geometry.maxBottom > geometry.height * 0.89) {
    throw new Error(`overlay ends too low for live safe area: ${JSON.stringify(geometry)}`);
  }

  if (geometry.leftSafeRight > geometry.width * 0.17 || geometry.rightSafeLeft < geometry.width * 0.83) {
    throw new Error(`overlay side rails intrude into the live center: ${JSON.stringify(geometry)}`);
  }
}

async function assertElementIconGeometry(page) {
  const geometry = await page.locator(".team-rail-left .pet-name-bar").first().evaluate((bar) => {
    const label = bar.getBoundingClientRect();
    const icons = [...bar.querySelectorAll(".element-icon-frame")].map((node) =>
      node.getBoundingClientRect()
    );
    return {
      labelHeight: label.height,
      firstWidth: icons[0]?.width ?? 0,
      firstHeight: icons[0]?.height ?? 0,
      firstTop: icons[0]?.top ?? 0,
      firstRight: icons[0]?.right ?? 0,
      secondBottom: icons[1]?.bottom,
      secondRight: icons[1]?.right
    };
  });

  if (
    Math.abs(geometry.firstWidth - geometry.labelHeight) > 1 ||
    Math.abs(geometry.firstHeight - geometry.labelHeight) > 1
  ) {
    throw new Error(
      `element icon size mismatch: label=${geometry.labelHeight}, icon=${geometry.firstWidth}x${geometry.firstHeight}`
    );
  }

  if (
    typeof geometry.secondBottom === "number" &&
    typeof geometry.secondRight === "number" &&
    (geometry.secondBottom > geometry.firstTop + 1 || geometry.secondRight > geometry.firstRight + 1)
  ) {
    throw new Error("second element icon overlaps the primary element icon");
  }
}

function assertTransparentCenter(buffer, label) {
  const png = PNG.sync.read(buffer);
  const x = Math.floor(png.width / 2);
  const y = Math.floor(png.height / 2);
  const alpha = png.data[(y * png.width + x) * 4 + 3];
  if (alpha !== 0) {
    throw new Error(`${label} center is not transparent: alpha=${alpha}`);
  }
}

function assertNonTransparentRatio(buffer, label, minRatio) {
  const png = PNG.sync.read(buffer);
  let nonTransparent = 0;
  for (let index = 3; index < png.data.length; index += 4) {
    if (png.data[index] > 8) {
      nonTransparent += 1;
    }
  }
  const ratio = nonTransparent / (png.width * png.height);
  if (ratio < minRatio) {
    throw new Error(`${label} has too little visible artwork: ratio=${ratio}`);
  }
}

function assertS3ColoredPencilAccent(buffer) {
  const png = PNG.sync.read(buffer);
  let pinkPixels = 0;
  const minX = Math.floor(png.width * 0.36);
  const maxX = Math.ceil(png.width * 0.64);
  const minY = Math.floor(png.height * 0.025);
  const maxY = Math.ceil(png.height * 0.135);
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const index = (y * png.width + x) * 4;
      const red = png.data[index];
      const green = png.data[index + 1];
      const blue = png.data[index + 2];
      if (red > 190 && blue > 130 && red - green > 12 && red - blue > 4) {
        pinkPixels += 1;
      }
    }
  }
  if (pinkPixels < 100) {
    throw new Error(`S3 colored-pencil accents missing from packaged room title: ${pinkPixels} pink pixels`);
  }
  return pinkPixels;
}

function killTree(pid) {
  return new Promise((resolve, reject) => {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
