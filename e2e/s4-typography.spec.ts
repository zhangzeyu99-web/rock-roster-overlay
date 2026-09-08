import { expect, test, type Locator, type Page } from "@playwright/test";
import { createDefaultRosterProject } from "../src/core/project";
import { applySeasonTheme } from "../src/core/season";
import type { SeasonTheme } from "../src/types";

const storageKey = "s4-typography-project";
const roles = [
  { role: "player-left", label: "左选手", selector: ".room-player-side-left .room-player-name", initialSize: 58, targetSize: 84 },
  { role: "player-right", label: "右选手", selector: ".room-player-side-right .room-player-name", initialSize: 58, targetSize: 96 },
  { role: "score-left", label: "左比分", selector: ".room-score-value-left", initialSize: 118, targetSize: 84 },
  { role: "score-right", label: "右比分", selector: ".room-score-value-right", initialSize: 118, targetSize: 96 }
] as const;

async function openEditor(page: Page, theme: SeasonTheme = "s4") {
  const project = applySeasonTheme(createDefaultRosterProject(), theme);
  project.room!.textBoxes.find((box) => box.role === "player-left")!.text = "甲方";
  project.room!.textBoxes.find((box) => box.role === "player-right")!.text = "乙方";
  project.room!.textBoxes.reverse();
  await page.addInitScript(({ initial, key }) => {
    let current = JSON.parse(localStorage.getItem(key) || JSON.stringify(initial));
    (window as any).roster = {
      getState: async () => ({ project: current, projects: [current], activeProjectId: current.id,
        assets: [], dataDir: "test", exportDir: "test", serverUrl: location.origin }),
      saveProject: async (next: any) => {
        current = next;
        localStorage.setItem(key, JSON.stringify(next));
        return current;
      },
      onStateChanged: () => () => undefined,
      onRuntimeCacheChanged: () => () => undefined,
      getRuntimeCacheStatus: async () => undefined,
      getObsWindowState: async () => ({ open: false }),
      onObsWindowStateChanged: () => () => undefined
    };
  }, { initial: project, key: storageKey });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".room-player-bar")).toBeVisible();
  await page.locator(".app-nav").getByRole("button", { name: "装修", exact: true }).click();
}

async function roleStyle(page: Page, label: string) {
  await page.locator(".room-text-list-item").filter({ has: page.locator("em", { hasText: new RegExp(`^${label}$`) }) }).click();
  const panel = page.getByTestId("room-selected-text-style");
  if ((await panel.getAttribute("open")) === null) await panel.locator("summary").click();
  return panel;
}

async function setSlider(input: Locator, value: number) {
  await input.focus();
  await input.press("End");
  const maximum = Number(await input.getAttribute("max"));
  for (let count = 0; count < maximum - value; count++) await input.press("ArrowLeft");
  await input.press("Tab");
  await expect(input).toHaveValue(String(value));
}

async function fontSize(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
}

async function sizes(page: Page) {
  return Promise.all(roles.map((role) => fontSize(page, role.selector)));
}

async function saved(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), storageKey);
}

for (const theme of ["s4", "s3"] as const) {
  test(`${theme} name and score sliders independently change rendered HUD sizes and survive reload`, async ({ page }) => {
    test.setTimeout(60000);
    await openEditor(page, theme);
    const original = await sizes(page);
    const center = await Promise.all([fontSize(page, ".room-score-separator"), fontSize(page, ".room-score-format")]);
    const expected = [...original];
    for (const [index, role] of roles.entries()) {
      const panel = await roleStyle(page, role.label);
      await setSlider(panel.locator("label.field-row").filter({ has: page.locator("span", { hasText: /^字号$/ }) }).locator("input[type=range]"), role.targetSize);
      expected[index] = original[index] * role.targetSize / role.initialSize;
      await expect.poll(() => fontSize(page, role.selector)).toBeCloseTo(expected[index], 1);
      const actual = await sizes(page);
      actual.forEach((size, other) => expect(size).toBeCloseTo(expected[other], 1));
    }
    expect(await fontSize(page, ".room-score-separator")).toBeCloseTo(center[0], 2);
    expect(await fontSize(page, ".room-score-format")).toBeCloseTo(center[1], 2);
    await expect.poll(async () => (await saved(page))?.room.textBoxes.find((box: any) => box.role === "score-right").fontSize).toBe(96);
    await page.reload();
    await expect(page.locator(".room-player-bar")).toBeVisible();
    (await sizes(page)).forEach((size, index) => expect(size).toBeCloseTo(expected[index], 1));
  });
}

test("S4 UI color and font controls reach each visible HUD role and persist", async ({ page }) => {
  await openEditor(page);
  const oppositeBefore = await page.locator(roles[1].selector).evaluate((node) => ({ color: getComputedStyle(node).color, font: getComputedStyle(node).fontFamily }));
  for (const [index, role] of roles.entries()) {
    const panel = await roleStyle(page, role.label);
    const color = index % 2 === 0 ? "#884422" : "#225588";
    const rgb = index % 2 === 0 ? "rgb(136, 68, 34)" : "rgb(34, 85, 136)";
    await panel.locator(".color-field").filter({ has: page.locator("span", { hasText: /^文字$/ }) }).locator("input").fill(color);
    await panel.locator(".font-picker select").selectOption("hei");
    await expect(page.locator(role.selector)).toHaveCSS("color", rgb);
    await expect(page.locator(role.selector)).toHaveCSS("font-family", /SimHei/);
    if (index === 0) {
      await expect(page.locator(roles[1].selector)).toHaveCSS("color", oppositeBefore.color);
      await expect(page.locator(roles[1].selector)).toHaveCSS("font-family", oppositeBefore.font);
    }
  }
  await expect.poll(async () => (await saved(page))?.room.textBoxes.find((box: any) => box.role === "score-right").fontFamily).toContain("SimHei");
  await page.reload();
  await expect(page.locator(".room-player-bar")).toBeVisible();
  for (const [index, role] of roles.entries()) {
    await expect(page.locator(role.selector)).toHaveCSS("color", index % 2 === 0 ? "rgb(136, 68, 34)" : "rgb(34, 85, 136)");
    await expect(page.locator(role.selector)).toHaveCSS("font-family", /SimHei/);
  }
});

test("VS and match-format sliders operate independently of player text and preserve empty format after reload", async ({ page }) => {
  await openEditor(page);
  const before = await sizes(page);
  const initialVs = await fontSize(page, ".room-score-separator");
  const initialFormat = await fontSize(page, ".room-score-format");
  const panel = page.getByTestId("score-center-fonts");
  await panel.locator("summary").click();
  await setSlider(panel.locator("label").filter({ hasText: "VS 字号" }).locator("input"), 40);
  await expect.poll(() => fontSize(page, ".room-score-separator")).toBeCloseTo(initialVs * 40 / 26, 1);
  expect(await fontSize(page, ".room-score-format")).toBeCloseTo(initialFormat, 2);
  await setSlider(panel.locator("label").filter({ hasText: "比赛局数字号" }).locator("input"), 30);
  await expect.poll(() => fontSize(page, ".room-score-format")).toBeCloseTo(initialFormat * 30 / 20, 1);
  expect(await sizes(page)).toEqual(before);
  await expect.poll(async () => (await saved(page))?.room.hud.playerBar.formatFontSize).toBe(30);
  await page.reload();
  await expect(page.locator(".room-player-bar")).toBeVisible();
  expect(await fontSize(page, ".room-score-separator")).toBeCloseTo(initialVs * 40 / 26, 1);
  expect(await fontSize(page, ".room-score-format")).toBeCloseTo(initialFormat * 30 / 20, 1);
  await page.locator(".app-nav").getByRole("button", { name: "装修", exact: true }).click();
  await page.locator("label.field-row").filter({ has: page.locator("span", { hasText: /^比赛局数$/ }) }).locator("input").fill("");
  await expect.poll(async () => (await saved(page))?.room.hud.playerBar.boText).toBe("");
  await page.reload();
  await expect(page.locator(".room-score-format")).toBeHidden();
  await expect(page.locator(".room-score-separator")).toBeVisible();
});

test("S4 controls show effective defaults and explicitly selected legacy colors and fonts are never ignored", async ({ page }) => {
  await openEditor(page);
  for (const role of roles) {
    const panel = await roleStyle(page, role.label);
    const colorInput = panel.locator(".color-field").filter({ has: page.locator("span", { hasText: /^文字$/ }) }).locator("input");
    await expect(colorInput).toHaveValue(role.role.startsWith("score") ? "#fff7df" : "#214759");
    const displayedFont = await panel.locator(".font-custom-row input").inputValue();
    const actualFont = await page.locator(role.selector).evaluate((node) => getComputedStyle(node).fontFamily);
    const normalizedDisplay = await page.evaluate((font) => {
      const probe = document.createElement("span");
      probe.style.fontFamily = font;
      return probe.style.fontFamily;
    }, displayedFont);
    expect(normalizedDisplay).toBe(actualFont);
    await colorInput.fill(role.role.endsWith("left") ? "#e42732" : "#2458e8");
    await panel.locator(".font-picker select").selectOption("genshin");
    await expect(page.locator(role.selector)).toHaveCSS("color", role.role.endsWith("left") ? "rgb(228, 39, 50)" : "rgb(36, 88, 232)");
    await expect(page.locator(role.selector)).toHaveCSS("font-family", /HYWenHei Extended/);
  }
  await expect.poll(async () => (await saved(page))?.room.textBoxes.find((box: any) => box.role === "score-right").hudFontOverride).toBe(true);
  await page.reload();
  await expect(page.locator(".room-player-bar")).toBeVisible();
  await page.locator(".app-nav").getByRole("button", { name: "装修", exact: true }).click();
  for (const role of roles) {
    const panel = await roleStyle(page, role.label);
    await expect(panel.locator(".font-picker select")).toHaveValue("genshin");
    await expect(page.locator(role.selector)).toHaveCSS("color", role.role.endsWith("left") ? "rgb(228, 39, 50)" : "rgb(36, 88, 232)");
    await expect(page.locator(role.selector)).toHaveCSS("font-family", /HYWenHei Extended/);
  }
});


for (const width of [1920, 2560]) {
  test(`central layouts preserve BO text and center VS at ${width}`, async ({ page }) => {
    await openEditor(page);
    await page.locator('.resolution-menu > button').click();
    await page.getByRole('button', { name: `${width} x ${width * 9 / 16}`, exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    const layout = page.getByTestId('score-center-layout');
    await layout.getByLabel('比赛局数', { exact: true }).fill('BO7');
    await expect.poll(async () => (await saved(page))?.room.hud.playerBar.boText).toBe('BO7');
    await layout.getByRole('button', { name: '仅 VS', exact: true }).click();
    await expect(page.locator('.room-score-format')).toBeHidden();
    await expect(page.locator('.room-player-bar')).toHaveClass(/room-player-bar-no-format/);
    const centers = await page.evaluate(() => ['.room-score-value-left', '.room-score-separator', '.room-score-value-right'].map((selector) => {
      const r = document.querySelector(selector)!.getBoundingClientRect(); return r.top + r.height / 2;
    }));
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
    await expect.poll(async () => (await saved(page))?.room.hud.playerBar.showFormat).toBe(false);
    await page.locator('.room-player-bar').screenshot({ path: `release-evidence/s4-development/score-vs-only-${width}.png` });
    await page.reload();
    await expect(page.locator('.room-score-format')).toBeHidden();
    await page.locator('.app-nav').getByRole('button', { name: '装修', exact: true }).click();
    await layout.getByRole('button', { name: 'VS＋比赛局数', exact: true }).click();
    await expect(layout.getByLabel('比赛局数', { exact: true })).toHaveValue('BO7');
    await expect(page.locator('.room-score-format')).toBeVisible();
    await expect(page.locator('.room-score-format')).toHaveText('BO7');
    await expect.poll(async () => (await saved(page))?.room.hud.playerBar.showFormat).toBe(true);
    await page.locator('.room-player-bar').screenshot({ path: `release-evidence/s4-development/score-vs-format-${width}.png` });
    if (width === 1920) {
      await layout.scrollIntoViewIfNeeded();
      await layout.screenshot({ path: 'release-evidence/s4-development/score-layout-controls.png' });
    }
    await page.reload();
    await expect(page.locator('.room-score-format')).toHaveText('BO7');
  });
}
