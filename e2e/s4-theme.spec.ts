import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createDefaultRosterProject, resolveRosterProject } from "../src/core/project";
import { applySeasonTheme } from "../src/core/season";
import { getRoomLayoutPresetStyleDefaults } from "../src/core/captureGeometry";
import type { PetAsset, RosterProject } from "../src/types";

const evidence = path.resolve("release-evidence/s4-development");
const allAssets: PetAsset[] = JSON.parse(await fs.readFile("seed-data/data/pets.json", "utf8"));
const names = ["迪莫", "火神", "水灵", "雪影娃娃", "海枝枝", "霹雳迪迪", "巨鼓象", "圆号鱼", "岚鸟", "化蝶", "蹦床松鼠", "泥吼牙"];
const assets = names.map((name, index) => allAssets.find((asset) => asset.name === name) ?? allAssets[index]);

function example(): RosterProject {
  const project = createDefaultRosterProject();
  for (const [side, offset] of [["left", 0], ["right", 6]] as const) {
    project.teams[side].slots = assets.slice(offset, offset + 6).map((asset) => ({ name: asset.name, assetId: asset.id, formAssetId: asset.id }));
  }
  project.room!.textBoxes.find((box) => box.role === "player-left")!.text = "月下旅人";
  project.room!.textBoxes.find((box) => box.role === "player-right")!.text = "逐星者";
  return project;
}

async function images(page: Page) {
  await page.route("**/assets/pets/*", async (route) => {
    const name = path.basename(decodeURIComponent(new URL(route.request().url()).pathname));
    await route.fulfill({ path: path.resolve("seed-data/assets/pets", name) });
  });
  await page.route("**/assets/avatars/*", async (route) => {
    const name = path.basename(decodeURIComponent(new URL(route.request().url()).pathname));
    await route.fulfill({ path: path.resolve("seed-data/assets/avatars", name) });
  });
}

async function ready(page: Page) {
  await expect(page.locator(".pet-art")).toHaveCount(12);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".pet-art, .pet-card-plate-cloud, .room-player-bar-art, .room-broadcast-title img")].every((img) => img.complete && img.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}

for (const mode of ["curved", "vertical"] as const) {
  for (const width of [1920, 2560]) {
    test(`S4 ${mode} ${width} renders complete real artwork in the live safe area`, async ({ page }) => {
      const project = example();
      project.room!.hud!.titleImage.visible = true;
      const resolution = { width, height: width * 9 / 16 };
      project.style = { ...project.style, ...getRoomLayoutPresetStyleDefaults(resolution, mode, "s4"), resolution };
      const resolved = resolveRosterProject(project, assets);
      await images(page);
      await page.route("**/api/state/default", (route) => route.fulfill({ json: resolved }));
      await page.setViewportSize(resolution);
      await page.goto("/overlay/default?mode=room");
      await ready(page);
      await expect(page.locator('.room-text-title')).toContainText("S4·月涌狂想");
      await expect(page.locator('.room-text-title')).toHaveAttribute("data-fill-style", "s4-moonlight");
      await expect(page.locator('.pet-card-plate-cloud').first()).toHaveAttribute("src", /s4-moon-ring/);
      await expect(page.locator('.room-player-bar-art')).toHaveAttribute("src", /s4-moon-relic/);
      const geometry = await page.evaluate(() => {
        const bar = document.querySelector('.room-player-bar')!.getBoundingClientRect();
        const cards = [...document.querySelectorAll('.roster-card')].map((node) => node.getBoundingClientRect());
        const vs = document.querySelector('.room-score-separator')!.getBoundingClientRect();
        const format = document.querySelector('.room-score-format')!.getBoundingClientRect();
        const clouds = [...document.querySelectorAll('.pet-card-plate-cloud')].map((node) => node.getBoundingClientRect());
        return { minTop: Math.min(...cards.map((r) => r.top)), cloudBottom: Math.max(...clouds.map((r) => r.bottom)), barTop: bar.top, barBottom: bar.bottom, centerDelta: Math.abs((vs.left + vs.right) / 2 - (bar.left + bar.right) / 2), vsBottom: vs.bottom, formatTop: format.top };
      });
      expect(geometry.minTop).toBeGreaterThan(resolution.height * 0.12);
      expect(geometry.cloudBottom).toBeLessThan(geometry.barTop);
      expect(geometry.barBottom).toBeLessThan(resolution.height);
      expect(geometry.centerDelta).toBeLessThan(1);
      expect(geometry.vsBottom).toBeLessThanOrEqual(geometry.formatTop + 1);
      await fs.mkdir(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, `s4-${mode}-${width}-transparent.png`), omitBackground: true, animations: "disabled" });
      if (mode === 'curved') await page.locator('.room-player-bar').screenshot({ path: path.join(evidence, `s4-player-name-inward-${width}.png`), animations: 'disabled' });
      await fs.writeFile(path.join(evidence, `s4-${mode}-${width}-geometry.json`), JSON.stringify(geometry, null, 2));
      await page.route("**/assets/backgrounds/qa-reference.png", (route) => route.fulfill({ path: path.resolve("docs/assets/s4-qa-gameplay.png") }));
      resolved.room!.background = { ...resolved.room!.background, visible: true, imagePath: "qa-reference.png", dim: 0 };
      await page.reload();
      await ready(page);
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.room-background-image')?.complete);
      await page.screenshot({ path: path.join(evidence, `s4-${mode}-${width}-gameplay.png`), animations: "disabled" });
      if (mode === "curved") {
        await page.setViewportSize({ width: 770, height: 434 });
        await ready(page);
        await page.screenshot({ path: path.join(evidence, `s4-title-${width}-770.png`), animations: "disabled" });
        await page.setViewportSize(resolution);
      }
      if (width === 1920 && mode === "curved") {
        const dark = resolveRosterProject(project, assets);
        dark.room!.background = { ...dark.room!.background, visible: true, imagePath: undefined, dim: 1 };
        await page.route("**/api/state/default", (route) => route.fulfill({ json: dark }));
        await page.reload();
        await ready(page);
        await page.screenshot({ path: path.join(evidence, "s4-dark-background.png"), animations: "disabled" });
        const s3 = applySeasonTheme(project, "s3");
        s3.room!.background = resolved.room!.background;
        await page.route("**/api/state/default", (route) => route.fulfill({ json: resolveRosterProject(s3, assets) }));
        await page.reload();
        await ready(page);
        await page.screenshot({ path: path.join(evidence, "s3-current-gameplay.png"), animations: "disabled" });
      }
    });
  }
}

test("S4 theme switch preserves custom content through layout, size, save and reload", async ({ page }) => {
  const project = applySeasonTheme(example(), "s3");
  project.room!.textBoxes.find((box) => box.role === "title")!.text = "周末友谊赛";
  project.room!.textBoxes.push({ ...project.room!.textBoxes[0], id: "custom-note", role: "custom", text: "决胜局", x: 600, y: 760 });
  await images(page);
  await page.addInitScript(({ initial, assets }) => {
    let current = JSON.parse(localStorage.getItem("s4-test-project") || JSON.stringify(initial));
    const state = () => ({ project: current, projects: [current], activeProjectId: current.id, assets, dataDir: "test", exportDir: "test", serverUrl: location.origin });
    (window as any).roster = {
      getState: async () => state(),
      saveProject: async (next: any) => { current = next; localStorage.setItem("s4-test-project", JSON.stringify(next)); return current; },
      onStateChanged: () => () => undefined,
      onRuntimeCacheChanged: () => () => undefined,
      getRuntimeCacheStatus: async () => undefined,
      getObsWindowState: async () => ({ open: false }),
      onObsWindowStateChanged: () => () => undefined
    };
  }, { initial: project, assets });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await ready(page);
  await page.locator('.app-nav').getByRole('button', { name: '装修', exact: true }).click();
  await page.getByRole('button', { name: 'S4 月涌狂想' }).click();
  await expect(page.getByRole('button', { name: 'S4 月涌狂想' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.room-text-title')).toContainText('周末友谊赛');
  await page.getByRole('button', { name: '3.2.5 旧版', exact: true }).click();
  await page.locator('.resolution-menu > button').click();
  await page.getByRole('button', { name: '2560 x 1440', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('s4-test-project')!).style.resolution.width)).toBe(2560);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('s4-test-project')!));
  expect(saved.style.teamLayout.mode).toBe('vertical');
  expect(saved.style.imageScale).toBe(0.94);
  expect(saved.room.textBoxes.find((box: any) => box.id === 'custom-note').text).toBe('决胜局');
  expect(saved.room.hud.playerBar.preset).toBe('s4-moon-relic');
  await page.reload();
  await ready(page);
  await expect(page.locator('.room-text-title')).toContainText('周末友谊赛');
  await expect(page.locator('.pet-card-plate-cloud').first()).toHaveAttribute('src', /s4-moon-ring/);
  await page.locator('.app-nav').getByRole('button', { name: '装修', exact: true }).click();
  const titleModes = page.getByTestId('room-title-mode');
  const originalTitle = await page.evaluate(() => JSON.parse(localStorage.getItem('s4-test-project')!).room.textBoxes.find((box: any) => box.role === 'title'));
  await titleModes.getByRole('button', { name: '美术字标', exact: true }).click();
  await expect(page.locator('.room-broadcast-title img')).toHaveAttribute('src', /s4-moon-reverie-title/);
  await expect(page.locator('.room-text-title')).toBeHidden();
  await expect(page.getByLabel('标题文字', { exact: true })).toHaveCount(0);
  await titleModes.getByLabel('字标素材').selectOption('builtin:rock-league-title-v1');
  await expect(page.locator('.room-broadcast-title img')).toHaveAttribute('src', /rock-league-title-v1-cutout/);
  await titleModes.getByLabel('字标素材').selectOption('builtin:s4-moon-reverie-title');
  await expect.poll(() => page.evaluate(() => { const image = JSON.parse(localStorage.getItem('s4-test-project')!).room.hud.titleImage; return image.visible && image.imagePath === 'builtin:s4-moon-reverie-title'; })).toBe(true);
  await page.reload();
  await ready(page);
  await page.locator('.app-nav').getByRole('button', { name: '装修', exact: true }).click();
  await expect(titleModes.getByRole('button', { name: '美术字标', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.room-broadcast-title')).toHaveClass(/room-broadcast-title-selected/);
  await expect(page.getByTestId('room-selected-text-style')).toHaveCount(0);
  await titleModes.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 's4-title-mode-art.png') });
  await titleModes.getByRole('button', { name: '系统字标（可编辑）', exact: true }).click();
  await expect(page.locator('.room-broadcast-title')).toHaveCount(0);
  await expect(page.locator('.room-text-title')).toBeVisible();
  await expect(page.getByLabel('标题文字', { exact: true })).toHaveValue('周末友谊赛');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('s4-test-project')!).room.textBoxes.find((box: any) => box.role === 'title'))).toEqual(originalTitle);
  await page.getByLabel('标题文字', { exact: true }).fill('月下决胜赛');
  await expect(page.locator('.room-text-title')).toContainText('月下决胜赛');
  await titleModes.getByRole('button', { name: '美术字标', exact: true }).click();
  await titleModes.getByRole('button', { name: '系统字标（可编辑）', exact: true }).click();
  await expect(page.getByLabel('标题文字', { exact: true })).toHaveValue('月下决胜赛');
  await titleModes.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 's4-title-mode-system.png') });
  await page.locator('.app-nav').getByRole('button', { name: '阵容', exact: true }).click();
  const tuning = page.getByTestId('roster-display-tuning');
  if (!(await tuning.evaluate((node) => node.hasAttribute('open')))) await tuning.locator('summary').click();
  const plate = page.locator('label.field-row').filter({ has: page.locator('span', { hasText: /^底框$/ }) }).locator('select');
  await expect(plate.locator('option')).toHaveText(['S4 · A 月环留白', 'S4 · B 星轨横签', 'S4 · C 月窗徽章', 'S3 柔和云朵', '纯透明', '矩形背景']);
  await plate.selectOption('s3');
  await expect(page.locator('.pet-card-plate-cloud').first()).toHaveAttribute('src', /rock-world-cloud-plate/);
  await plate.selectOption('moon-ring');
  await expect(page.locator('.pet-card-plate-cloud').first()).toHaveAttribute('src', /s4-moon-ring.png/);
  await page.locator('.resolution-menu > button').click();
  await page.getByRole('button', { name: '1920 x 1080', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('s4-test-project')!).style.imageScale)).toBe(0.90);
  await page.getByRole('button', { name: '2560 x 1440', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('s4-test-project')!).style.imageScale)).toBe(0.94);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await plate.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 's4-editor-1280.png') });
});


for (const [left, right, format] of [["0", "0", "BO5"], ["12", "9", "BO5"], ["999", "1", "BO5"], ["0", "0", ""]]) {
  test(`S4 compact preview keeps ${left}:${right} ${format || "no format"} inside the dark frame`, async ({ page }) => {
    const project = example();
    project.room!.textBoxes.find((box) => box.role === "score-left")!.text = left;
    project.room!.textBoxes.find((box) => box.role === "score-right")!.text = right;
    project.room!.hud!.playerBar.boText = format;
    await images(page);
    await page.route("**/api/state/default", (route) => route.fulfill({ json: resolveRosterProject(project, assets) }));
    await page.setViewportSize({ width: 770, height: 434 });
    await page.goto("/overlay/default?mode=room");
    await ready(page);
    await page.addStyleTag({ content: "body { background-color: #fff; background-image: conic-gradient(#e8edf5 25%, transparent 0 50%, #e8edf5 0 75%, transparent 0); background-size: 24px 24px; }" });
    const bounds = await page.evaluate(() => {
      const bar = document.querySelector('.room-player-bar')!.getBoundingClientRect();
      const selectors = ['.room-score-value-left', '.room-score-separator', '.room-score-value-right', '.room-score-format'];
      return selectors.map((selector) => {
        const node = document.querySelector(selector)!;
        const range = document.createRange(); range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        const style = getComputedStyle(node);
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const metrics = context.measureText(node.textContent || " ");
        const scale = rect.width / metrics.width;
        const baseline = rect.top + metrics.fontBoundingBoxAscent * scale;
        return { selector, text: node.textContent,
          left: (rect.left - metrics.actualBoundingBoxLeft * scale - bar.left) / bar.width,
          right: (rect.left + metrics.actualBoundingBoxRight * scale - bar.left) / bar.width,
          top: (baseline - metrics.actualBoundingBoxAscent * scale - bar.top) / bar.height,
          bottom: (baseline + metrics.actualBoundingBoxDescent * scale - bar.top) / bar.height };
      });
    });
    await page.screenshot({ path: path.join(evidence, `s4-compact-${left}-${right}-${format || "empty"}.png`) });
    await fs.writeFile(path.join(evidence, `s4-compact-${left}-${right}-${format || "empty"}.json`), JSON.stringify(bounds, null, 2));
    for (const rect of bounds.filter((item) => item.text)) {
      expect(rect.left).toBeGreaterThan(0.419);
      expect(rect.right).toBeLessThan(0.582);
      expect(rect.top).toBeGreaterThan(0.20);
      expect(rect.bottom).toBeLessThan(0.70);
    }
    expect(bounds[0].right).toBeLessThan(bounds[1].left);
    expect(bounds[1].right).toBeLessThan(bounds[2].left);
    if (format) expect(bounds[1].bottom).toBeLessThanOrEqual(bounds[3].top + 0.02);
    await page.screenshot({ path: path.join(evidence, `s4-compact-${left}-${right}-${format || "empty"}.png`) });
  });
}


test("ABC backplates switch in the editor and survive reload and both resolution presets", async ({ page }) => {
  await images(page);
  await page.addInitScript(({ initial, assets }) => {
    let current = JSON.parse(localStorage.getItem("abc-project") || JSON.stringify(initial));
    localStorage.setItem("abc-project", JSON.stringify(current));
    (window as any).roster = {
      getState: async () => ({ project: current, projects: [current], activeProjectId: current.id, assets, dataDir: "test", exportDir: "test", serverUrl: location.origin }),
      saveProject: async (next: any) => { current = next; localStorage.setItem("abc-project", JSON.stringify(next)); return current; },
      onStateChanged: () => () => undefined, onRuntimeCacheChanged: () => () => undefined,
      getRuntimeCacheStatus: async () => undefined, getObsWindowState: async () => ({ open: false }),
      onObsWindowStateChanged: () => () => undefined
    };
  }, { initial: example(), assets });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const openTuning = async () => {
    await page.locator('.app-nav').getByRole('button', { name: '阵容', exact: true }).click();
    const tuning = page.getByTestId('roster-display-tuning');
    if (!(await tuning.evaluate((node) => node.hasAttribute('open')))) await tuning.locator('summary').click();
  };
  const plate = page.getByLabel('底框', { exact: true });
  for (const variant of ['moon-ring', 'star-pennant', 'moon-window']) {
    await openTuning();
    await plate.selectOption(variant);
    await ready(page);
    await expect(page.locator('.pet-card-plate-cloud').first()).toHaveAttribute('src', new RegExp(`s4-${variant}\\.png$`));
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('abc-project')!).style.s4CardPlate)).toBe(variant);
    await page.reload();
    await ready(page);
    await openTuning();
    await expect(plate).toHaveValue(variant);
    await page.locator('.resolution-menu > button').click();
    for (const width of [1920, 2560]) {
      await page.getByRole('button', { name: `${width} x ${width * 9 / 16}`, exact: true }).click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('abc-project')!).style.resolution.width)).toBe(width);
      await expect(plate).toHaveValue(variant);
      await ready(page);
    }
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await plate.scrollIntoViewIfNeeded();
    await fs.mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, `abc-editor-${variant}.png`) });
  }
  await plate.selectOption('transparent');
  await expect(page.locator('.pet-card-plate')).toHaveCount(0);
  await plate.selectOption('s3');
  await expect(page.locator('.pet-card-plate-cloud').first()).toHaveAttribute('src', /rock-world-cloud-plate/);
  await plate.selectOption('star-pennant');
  await ready(page);
  await expect(plate).toHaveValue('star-pennant');
});
