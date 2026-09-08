import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { _electron as electron, chromium } from "playwright";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = path.join(root, "release-evidence", "s4-development");
const sandbox = path.join(root, "tmp", `s4-runtime-${Date.now()}`);
const documents = path.join(sandbox, "documents");
const userData = path.join(sandbox, "userData");
await Promise.all([fs.mkdir(documents, { recursive: true }), fs.mkdir(userData, { recursive: true }), fs.mkdir(evidence, { recursive: true })]);
const bootstrap = path.join(sandbox, "bootstrap.cjs");
await fs.writeFile(bootstrap, `const { app } = require("electron");
app.setPath('documents', ${JSON.stringify(documents)});
app.setPath('userData', ${JSON.stringify(userData)});
import(${JSON.stringify(new URL("../dist-electron/main.js", import.meta.url).href)});`, "utf8");

let app;
let browser;
const checks = [];
try {
  app = await electron.launch({ args: [bootstrap], cwd: root });
  const gui = await app.firstWindow();
  await gui.waitForSelector(".app-shell");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  const state = await gui.evaluate(() => window.roster.getState());
  assert.equal(path.resolve(state.dataDir), path.join(documents, "RockRosterOverlay"));
  checks.push({ check: "isolated user configuration", dataDir: state.dataDir });
  const titleExportPath = path.join(evidence, "native-s4-title-asset.png");
  await app.evaluate(({ dialog }, filePath) => {
    globalThis.s4OriginalSaveDialog = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, titleExportPath);
  try {
    const titleExport = await gui.evaluate(() => window.roster.exportHudImage("builtin:s4-moon-reverie-title", "s4-title"));
    assert.equal(titleExport, titleExportPath);
    const bytes = await fs.readFile(titleExportPath);
    assert.deepEqual(bytes, await fs.readFile(path.join(root, "public/room-titles/s4-moon-reverie-title.png")));
    const png = PNG.sync.read(bytes);
    let transparent = 0;
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 0) transparent++;
    assert.ok(transparent / (png.width * png.height) > 0.3, "Title must have real transparency, not a baked checkerboard");
    assert.equal(png.data[3], 0);
    checks.push({ check: "native builtin S4 title export and alpha", width: png.width, height: png.height, transparentFraction: transparent / (png.width * png.height) });
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = globalThis.s4OriginalSaveDialog; delete globalThis.s4OriginalSaveDialog; });
  }
  const original = structuredClone(state.project);
  const demo = structuredClone(original);
  const names = ["迪莫", "火神", "水灵", "雪影娃娃", "海枝枝", "霹雳迪迪", "巨鼓象", "圆号鱼", "岚鸟", "化蝶", "蹦床松鼠", "泥吼牙"];
  for (const [side, offset] of [["left", 0], ["right", 6]]) {
    demo.teams[side].slots = names.slice(offset, offset + 6).map((name, i) => {
      const asset = state.assets.find((item) => item.name === name) ?? state.assets[offset + i];
      return { name: asset.name, assetId: asset.id, formAssetId: asset.id };
    });
  }
  demo.room.textBoxes.find((box) => box.role === "player-left").text = "月下旅人";
  demo.room.textBoxes.find((box) => box.role === "player-right").text = "逐星者";
  demo.room.hud.playerBar.animation = false;
  demo.room.hud.titleImage.visible = true;
  browser = await chromium.launch({ headless: true });
  const obs = await browser.newPage();
  const errors = [];
  gui.on("pageerror", (e) => errors.push(e.message));
  obs.on("pageerror", (e) => errors.push(e.message));
  for (const plate of ["moon-ring", "star-pennant", "moon-window"]) for (const layout of ["curved", "vertical"]) for (const width of [1920, 2560]) {
    const height = width * 9 / 16;
    const project = structuredClone(demo);
    Object.assign(project.style, { s4CardPlate: plate, resolution: { width, height }, cardGap: width === 1920 ? 14 : 12, imageScale: width === 1920 ? 0.90 : 0.94, cardPlateScale: 0.96, cardPlateYOffset: 0, teamLayout: { mode: layout, centerGap: 1540, verticalOffset: 0 } });
    await gui.evaluate((next) => window.roster.saveProject(next), project);
    await obs.setViewportSize({ width, height });
    await obs.goto(`${state.serverUrl}/overlay/default?mode=room`);
    await waitImages(obs);
    assert.match(await obs.locator(".room-text-title").textContent(), /S4·月涌狂想/);
    for (const mode of ["room", "overlay", "left", "right"]) {
      assert.deepEqual((await gui.evaluate(() => window.roster.getState())).project.style.resolution, { width, height }, "QA project resolution changed during export");
      const exported = await gui.evaluate((mode) => window.roster.exportPng(mode), mode);
      const target = path.join(evidence, `native-${plate}-${layout}-${width}-${mode}.png`);
      await fs.copyFile(exported, target);
      const png = PNG.sync.read(await fs.readFile(target));
      assert.equal(png.width, mode === "left" || mode === "right" ? Math.round(420 * height / 1080) : width);
      assert.equal(png.height, height);
      for (const index of [0, png.width - 1, (png.height - 1) * png.width, png.width * png.height - 1]) assert.equal(png.data[index * 4 + 3], 0);
      if (mode === "room" || mode === "overlay") assert.equal(png.data[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 3], 0);
      checks.push({ check: "native transparent export", plate, layout, width, mode, file: path.basename(target) });
    }
    await gui.evaluate(() => window.roster.openObsWindow("room"));
    const capture = app.windows().find((page) => page.url().includes("capture=window"));
    assert.ok(capture, "capture window exists");
    await waitImages(capture);
    assert.equal(await capture.locator(`.pet-card-plate-cloud[src*="s4-${plate}"]`).count(), 12);
    await capture.screenshot({ path: path.join(evidence, `capture-${plate}-${layout}-${width}.png`), omitBackground: true });
    assert.equal((await gui.evaluate(() => window.roster.getObsWindowState())).open, true);
    await gui.evaluate(() => window.roster.closeObsWindow());
    assert.equal((await gui.evaluate(() => window.roster.getObsWindowState())).open, false);
    checks.push({ check: "capture theme and open/close", plate, layout, width });
  }
  await gui.evaluate((next) => window.roster.saveProject(next), demo);
  // 用产品现有 IPC 恢复主窗口，避免复用经历采集窗口关闭后的 Node 调试上下文。
  await gui.evaluate(() => window.roster.focusMainWindow());
  await gui.screenshot({ path: path.join(evidence, "native-desktop-gui.png") });
  await gui.evaluate(() => window.roster.openControlWindow());
  const control = app.windows().find((page) => page.url().includes("/control"));
  assert.ok(control, "floating control window exists");
  await control.waitForSelector(".floating-control-content");
  await control.screenshot({ path: path.join(evidence, "native-floating-control.png") });
  await gui.evaluate(() => window.roster.closeControlWindow());
  checks.push({ check: "native editor and floating controls" });
  await obs.setViewportSize({ width: 1920, height: 1080 });
  await obs.goto(`${state.serverUrl}/overlay/default?mode=room`);
  await waitImages(obs);
  const sizes = () => obs.evaluate(() => Object.fromEntries([
    ["leftName", ".room-player-side-left .room-player-name"], ["rightName", ".room-player-side-right .room-player-name"],
    ["leftScore", ".room-score-value-left"], ["rightScore", ".room-score-value-right"], ["vs", ".room-score-separator"]
  ].map(([key, selector]) => [key, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])));
  const before = await sizes();
  demo.room.textBoxes.find((box) => box.role === "player-left").fontSize = 90;
  await gui.evaluate((next) => window.roster.saveProject(next), demo);
  await obs.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.room-player-side-left .room-player-name')).fontSize) > 50);
  const afterName = await sizes();
  assert.ok(afterName.leftName > before.leftName * 1.4);
  assert.equal(afterName.rightName, before.rightName);
  assert.equal(afterName.leftScore, before.leftScore);
  demo.room.textBoxes.find((box) => box.role === "score-left").fontSize = 70;
  demo.room.hud.playerBar.boText = "";
  await gui.evaluate((next) => window.roster.saveProject(next), demo);
  await obs.waitForFunction(() => document.querySelector('.room-score-format')?.textContent === "");
  const afterScore = await sizes();
  assert.ok(afterScore.leftScore < before.leftScore * 0.7);
  assert.equal(afterScore.rightScore, before.rightScore);
  assert.equal(afterScore.vs, before.vs);
  checks.push({ check: "independent name and score sizes, live sync, empty format", before, afterName, afterScore });
  const saved = await gui.evaluate(() => window.roster.getState());
  assert.equal(saved.project.room.hud.playerBar.boText, "");
  await gui.reload();
  await gui.waitForSelector('.app-shell');
  assert.equal((await gui.evaluate(() => window.roster.getState())).project.room.hud.playerBar.boText, "");
  await gui.evaluate((next) => window.roster.saveProject(next), original);
  assert.deepEqual(errors, []);
  checks.push({ check: "renderer errors", errors });
  const buildHashes = {};
  for (const file of ["dist-electron/main.js", "dist-electron/preload.cjs", "dist/index.html"]) {
    buildHashes[file] = crypto.createHash("sha256").update(await fs.readFile(path.join(root, file))).digest("hex");
  }
  const version = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version;
  await fs.writeFile(path.join(evidence, "native-runtime-qa.json"), JSON.stringify({ ok: true, version, sandbox, buildHashes, checks }, null, 2), "utf8");
  console.log(JSON.stringify({ ok: true, checks: checks.length, evidence }));
} finally {
  await browser?.close();
  await app?.close();
}

async function waitImages(page) {
  await page.waitForSelector('.roster-card');
  await page.waitForFunction(() => [...document.querySelectorAll('.pet-art, .pet-card-plate-cloud, .room-player-bar-art, .room-broadcast-title img')].every((img) => img.complete && img.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}
