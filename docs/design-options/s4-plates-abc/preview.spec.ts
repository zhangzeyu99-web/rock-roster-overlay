import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDefaultRosterProject, resolveRosterProject } from "../../../src/core/project";
import type { PetAsset } from "../../../src/types";

const out = path.resolve("docs/design-options/s4-plates-abc");
const all: PetAsset[] = JSON.parse(await fs.readFile("seed-data/data/pets.json", "utf8"));
const names = ["迪莫", "火神", "水灵", "雪影娃娃", "圣水迪莫", "霹雳迪迪", "巨鼓象", "圆号鱼", "岚鸟", "武斗酷猫", "蹦床松鼠", "泥吼牙"];
const assets = names.map(name => all.find(a => a.name === name)!);

test("render all selectable production backplates in the actual roster", async ({ page }) => {
  const project = createDefaultRosterProject();
  for (const [side, offset] of [["left", 0], ["right", 6]] as const) project.teams[side].slots = assets.slice(offset, offset + 6).map(a => ({ name: a.name, assetId: a.id, formAssetId: a.id }));
  project.room!.hud!.titleImage.visible = true;
  project.room!.textBoxes.find(b => b.role === "player-left")!.text = "月下旅人";
  project.room!.textBoxes.find(b => b.role === "player-right")!.text = "逐星者";
  const resolved = resolveRosterProject(project, assets);
  await page.route("**/api/state/default", route => route.fulfill({ json: resolved }));
  await page.route("**/assets/pets/*", route => route.fulfill({ path: path.resolve("seed-data/assets/pets", path.basename(decodeURIComponent(new URL(route.request().url()).pathname))) }));
  await page.route("**/assets/backgrounds/option-gameplay.png", route => route.fulfill({ path: path.resolve("docs/assets/s4-qa-gameplay.png") }));
  const ready = async () => {
    await expect(page.locator('.pet-art')).toHaveCount(12);
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('img')].every(i => i.complete && i.naturalWidth > 0));
    await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  };
  for (const key of ["A", "B", "C"]) {
    resolved.style.s4CardPlate = ({ A: "moon-ring", B: "star-pennant", C: "moon-window" } as const)[key as "A" | "B" | "C"];
    resolved.room!.background.visible = false;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/overlay/default?mode=room');
    await ready();
    await page.addStyleTag({ content: 'body { background:#f0eee8 !important; }' });
    await page.locator('.team-rail-left .roster-card').nth(0).screenshot({ path: path.join(out, `${key}-light.png`) });
    await page.addStyleTag({ content: 'body { background:#233743 !important; }' });
    await page.locator('.team-rail-left .roster-card').nth(3).screenshot({ path: path.join(out, `${key}-dark.png`) });
    resolved.room!.background = { ...resolved.room!.background, visible: true, imagePath: 'option-gameplay.png', dim: 0 };
    await page.reload(); await ready();
    await page.screenshot({ path: path.join(out, `${key}-gameplay-full.png`) });
    await page.setViewportSize({ width: 770, height: 434 });
    await ready();
    await page.screenshot({ path: path.join(out, `${key}-gameplay.png`) });
  }
  await page.setViewportSize({ width: 1380, height: 1040 });
  await page.goto(pathToFileURL(path.join(out, 'index.html')).href);
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: path.join(out, 'ABC-comparison.png'), fullPage: true });
});
