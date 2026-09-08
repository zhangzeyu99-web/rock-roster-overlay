import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createDefaultRosterProject, resolveRosterProject } from "../src/core/project";
import { getRoomLayoutPresetStyleDefaults } from "../src/core/captureGeometry";
import type { PetAsset } from "../src/types";

const evidence = path.resolve("release-evidence/s4-development");
const allAssets: PetAsset[] = JSON.parse(await fs.readFile("seed-data/data/pets.json", "utf8"));
const names = ["迪莫", "火神", "水灵", "雪影娃娃", "圣水迪莫", "霹雳迪迪", "巨鼓象", "圆号鱼", "岚鸟", "武斗酷猫", "蹦床松鼠", "泥吼牙"];
const examples = names.map((name) => {
  const asset = allAssets.find((item) => item.name === name);
  if (!asset) throw new Error(`Missing spacing fixture asset: ${name}`);
  return asset;
});

async function ready(page: Page) {
  await expect(page.locator(".pet-art")).toHaveCount(12);
  await expect(page.locator(".pet-card-plate")).toHaveCount(12);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".pet-art, img.pet-card-plate, .room-player-bar-art")]
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function measureSpacing(page: Page) {
  return page.evaluate(async () => {
    type Bounds = { left: number; top: number; right: number; bottom: number };
    type Mask = { kind: string; bounds: Bounds; left: number; top: number; width: number; height: number; alpha: Uint8ClampedArray };
    const alphaThreshold = 32;
    const createMask = async (node: Element, kind: string): Promise<Mask> => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const width = Math.max(1, Math.ceil(rect.width));
      const height = Math.max(1, Math.ceil(rect.height));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.globalAlpha = Number(style.opacity);
      if (node instanceof HTMLImageElement || node instanceof SVGSVGElement) {
        let image: HTMLImageElement;
        if (node instanceof HTMLImageElement) {
          image = node;
        } else {
          image = new Image();
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(node))}`;
          await image.decode();
        }
        const contain = style.objectFit === "contain";
        const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        const drawWidth = contain ? image.naturalWidth * scale : rect.width;
        const drawHeight = contain ? image.naturalHeight * scale : rect.height;
        context.drawImage(image, (rect.width - drawWidth) / 2, (rect.height - drawHeight) / 2, drawWidth, drawHeight);
      } else if (kind === "name" || kind === "element") {
        const radius = style.borderRadius.includes("%")
          ? Math.min(rect.width, rect.height) / 2
          : Math.min(parseFloat(style.borderRadius) || 0, rect.width / 2, rect.height / 2);
        context.fillStyle = "white";
        context.beginPath();
        context.roundRect(0, 0, rect.width, rect.height, radius);
        context.fill();
      } else {
        throw new Error(`Unsupported plate markup: ${node.tagName}`);
      }
      const alpha = context.getImageData(0, 0, width, height).data;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (alpha[(y * width + x) * 4 + 3] < alphaThreshold) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX < 0) throw new Error(`Invisible ${kind} cannot prove spacing`);
      return { kind, alpha, width, height, left: rect.left, top: rect.top,
        bounds: { left: rect.left + minX, top: rect.top + minY, right: rect.left + maxX + 1, bottom: rect.top + maxY + 1 } };
    };
    const inkAt = (mask: Mask, x: number, y: number) => {
      const localX = Math.floor(x - mask.left);
      const localY = Math.floor(y - mask.top);
      return localX >= 0 && localY >= 0 && localX < mask.width && localY < mask.height &&
        mask.alpha[(localY * mask.width + localX) * 4 + 3] >= alphaThreshold;
    };
    const overlap = (first: Mask, second: Mask) => {
      const left = Math.max(first.bounds.left, second.bounds.left);
      const right = Math.min(first.bounds.right, second.bounds.right);
      const top = Math.max(first.bounds.top, second.bounds.top);
      const bottom = Math.min(first.bounds.bottom, second.bounds.bottom);
      let pixels = 0;
      for (let y = Math.ceil(top); y < Math.floor(bottom); y++) {
        for (let x = Math.ceil(left); x < Math.floor(right); x++) {
          if (inkAt(first, x + 0.5, y + 0.5) && inkAt(second, x + 0.5, y + 0.5)) pixels++;
        }
      }
      return pixels;
    };
    const slots = await Promise.all([...document.querySelectorAll<HTMLElement>(".roster-card")].map(async (card, index) => {
      const image = card.querySelector<HTMLImageElement>(".pet-art")!;
      const components = await Promise.all([
        createMask(image, "pet"),
        createMask(card.querySelector(".pet-name-bar")!, "name"),
        createMask(card.querySelector(".pet-card-plate")!, "plate"),
        ...[...card.querySelectorAll(".element-icon-frame")].map((element) => createMask(element, "element"))
      ]);
      return { side: card.dataset.side!, index, name: image.alt, components };
    }));
    const overlaps: Array<{ side: string; upper: string; lower: string; upperPart: string; lowerPart: string; pixels: number }> = [];
    const gaps: Array<{ side: string; upper: string; lower: string; verticalGap: number }> = [];
    for (const side of ["left", "right"]) {
      const team = slots.filter((slot) => slot.side === side);
      for (let index = 1; index < team.length; index++) {
        const upper = team[index - 1];
        const lower = team[index];
        const bottom = Math.max(...upper.components.map((component) => component.bounds.bottom));
        const top = Math.min(...lower.components.map((component) => component.bounds.top));
        gaps.push({ side, upper: upper.name, lower: lower.name, verticalGap: top - bottom });
        for (const upperPart of upper.components) {
          for (const lowerPart of lower.components) {
            const pixels = overlap(upperPart, lowerPart);
            if (pixels > 0) overlaps.push({ side, upper: upper.name, lower: lower.name,
              upperPart: upperPart.kind, lowerPart: lowerPart.kind, pixels });
          }
        }
      }
    }
    return { alphaThreshold, overlaps, gaps,
      slots: slots.map(({ components, ...slot }) => ({ ...slot, components: components.map(({ kind, bounds }) => ({ kind, bounds })) })) };
  });
}

for (const s4CardPlate of ["moon-ring", "star-pennant", "moon-window"] as const) {
for (const mode of ["curved", "vertical"] as const) {
  for (const width of [1920, 2560]) {
    test(`S4 ${s4CardPlate} ${mode} ${width} separates adjacent pet ink, labels and plates at output and compact preview sizes`, async ({ page }) => {
      const resolution = { width, height: width * 9 / 16 };
      const project = createDefaultRosterProject();
      project.style.s4CardPlate = s4CardPlate;
      project.style = { ...project.style, ...getRoomLayoutPresetStyleDefaults(resolution, mode, "s4"), resolution };
      for (const [side, offset] of [["left", 0], ["right", 6]] as const) {
        project.teams[side].slots = examples.slice(offset, offset + 6).map((asset) => ({ name: asset.name, assetId: asset.id, formAssetId: asset.id }));
      }
      await page.route("**/assets/pets/*", async (route) => {
        const image = path.basename(decodeURIComponent(new URL(route.request().url()).pathname));
        await route.fulfill({ path: path.resolve("seed-data/assets/pets", image) });
      });
      await page.route("**/api/state/default", (route) => route.fulfill({ json: resolveRosterProject(project, allAssets) }));
      await page.setViewportSize(resolution);
      await page.goto("/overlay/default?mode=room");
      await ready(page);
      const output = await measureSpacing(page);
      await fs.mkdir(evidence, { recursive: true });
      const prefix = `s4-spacing-${s4CardPlate}-${mode}-${width}`;
      await page.screenshot({ path: path.join(evidence, `${prefix}-full.png`), animations: "disabled" });
      await page.setViewportSize({ width: 770, height: 434 });
      await ready(page);
      const compact = await measureSpacing(page);
      await page.screenshot({ path: path.join(evidence, `${prefix}-770.png`), animations: "disabled" });
      await fs.writeFile(path.join(evidence, `${prefix}.json`), JSON.stringify({
        sourceAssetCount: allAssets.length, names, resolution, mode, output, compact
      }, null, 2), "utf8");
      expect.soft(output.overlaps, `Output overlaps: ${JSON.stringify(output.overlaps)}`).toEqual([]);
      expect.soft(compact.overlaps, `770px preview overlaps: ${JSON.stringify(compact.overlaps)}`).toEqual([]);
    });
  }
}
}
