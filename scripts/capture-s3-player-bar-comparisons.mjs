import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const generatedRoot = process.env.S3_PLAYER_BAR_REFERENCE_DIR;

if (!generatedRoot) {
  throw new Error("Set S3_PLAYER_BAR_REFERENCE_DIR to the directory containing the approved design images.");
}
const comparisons = [
  ["s3-storybook", `${generatedRoot}/exec-a3ce9f70-0f3f-4e21-bc89-c7c3d31f8254.png`],
  ["s3-prism-bookmark", `${generatedRoot}/exec-ae2c5908-e1ef-46d2-88af-cf9b4c877eeb.png`],
  ["s3-clover-hinge", `${generatedRoot}/exec-f2b16eae-48e2-446a-b591-b93589e1eb74.png`]
];

const dataUrl = (filePath) => `data:image/png;base64,${readFileSync(filePath).toString("base64")}`;
const browser = await chromium.launch({ headless: true });

for (const [name, referencePath] of comparisons) {
  const implementationPath = resolve(root, `output/playwright/${name}-implementation.png`);
  const page = await browser.newPage({ viewport: { width: 1800, height: 660 }, deviceScaleFactor: 1 });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eef0ec; color: #30451d; font-family: Arial, sans-serif; }
      .label { height: 34px; padding: 8px 28px; font-size: 16px; font-weight: 700; }
      .reference { height: 300px; overflow: hidden; background: #fafafa; }
      .reference img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 43%; }
      .implementation { height: 292px; display: flex; align-items: center; justify-content: center; background: #fafafa; }
      .implementation img { width: min(1500px, 96%); height: auto; object-fit: contain; }
    </style>
    <div class="label">REFERENCE</div>
    <div class="reference"><img src="${dataUrl(referencePath)}" alt=""></div>
    <div class="label">IMPLEMENTATION</div>
    <div class="implementation"><img src="${dataUrl(implementationPath)}" alt=""></div>
  `);
  await page.screenshot({ path: resolve(root, `output/playwright/${name}-comparison.png`) });
  await page.close();
}

await browser.close();
