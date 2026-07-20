import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const root = resolve(import.meta.dirname, "..");
const basePath = resolve(root, "docs/assets/readme-hero-base-v3.png");
const outputPath = resolve(root, "docs/assets/readme-hero-v3.png");
const petsRoot = resolve(root, "seed-data/assets/pets");
const iconsRoot = resolve(root, "public/element-icons");
const pets = JSON.parse(readFileSync(resolve(root, "seed-data/data/pets.json"), "utf8"));
const base = PNG.sync.read(readFileSync(basePath));

const leftRoster = [
  ["迪莫", "light"],
  ["圣光迪莫", "light"],
  ["圣草迪莫", "grass"],
  ["圣火迪莫", "fire"],
  ["圣水迪莫", "water"],
  ["喵喵", "grass"]
];

const rightRoster = [
  ["喵呜", "grass"],
  ["魔力猫", "grass"],
  ["叶冕魔力猫", "grass"],
  ["武斗酷猫", "grass"],
  ["火花", "fire"],
  ["焰火", "fire"]
];

const dataUrl = (path) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const petByName = new Map(pets.map((pet) => [pet.name, pet]));

const rosterMarkup = (entries, side) => entries.map(([name, element], index) => {
  const pet = petByName.get(name);
  if (!pet) throw new Error(`Missing pet data: ${name}`);

  const sprite = dataUrl(resolve(petsRoot, pet.imagePath));
  const icon = dataUrl(resolve(iconsRoot, `${element}.png`));
  return `
    <div class="slot ${side}" style="--slot-index:${index}">
      <img class="sprite" src="${sprite}" alt="">
      <div class="nameplate ${element}">
        <span class="element"><img src="${icon}" alt=""></span>
        <span class="name">${name}</span>
      </div>
    </div>`;
}).join("");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: base.width, height: base.height },
  deviceScaleFactor: 1
});

await page.setContent(`
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      position: relative;
      background: url("${dataUrl(basePath)}") center / 100% 100% no-repeat;
      font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    }
    .slot {
      --slot-y: calc(24px + var(--slot-index) * 99px);
      position: absolute;
      top: var(--slot-y);
      width: 184px;
      height: 102px;
      z-index: 2;
    }
    .slot.left { left: 20px; }
    .slot.right { right: 20px; }
    .sprite {
      position: absolute;
      left: 50%;
      top: -5px;
      width: 116px;
      height: 86px;
      object-fit: contain;
      object-position: center bottom;
      transform: translateX(-50%);
      filter: drop-shadow(0 3px 2px rgba(26, 52, 46, 0.2));
      z-index: 2;
    }
    .right .sprite { transform: translateX(-50%) scaleX(-1); }
    .nameplate {
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 164px;
      height: 31px;
      transform: translateX(-50%);
      display: grid;
      grid-template-columns: 29px 1fr 18px;
      align-items: center;
      color: #fff;
      background: rgba(34, 49, 49, 0.92);
      border: 2px solid rgba(255, 251, 229, 0.94);
      border-radius: 16px;
      box-shadow: 0 3px 8px rgba(24, 44, 39, 0.22);
      overflow: hidden;
      z-index: 1;
    }
    .right .nameplate { grid-template-columns: 18px 1fr 29px; }
    .element {
      grid-column: 1;
      grid-row: 1;
      width: 27px;
      height: 27px;
      margin-left: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: #65bd7d;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,0.55);
    }
    .right .element { grid-column: 3; }
    .fire .element { background: #ef6947; }
    .water .element { background: #5aa9ef; }
    .light .element { background: #55b9ea; }
    .element img { width: 19px; height: 19px; object-fit: contain; }
    .name {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
      padding: 0 3px;
      font-size: 15px;
      line-height: 1;
      font-weight: 700;
      text-align: center;
      white-space: nowrap;
      text-shadow: 0 1px 2px rgba(0,0,0,0.45);
    }
  </style>
  ${rosterMarkup(leftRoster, "left")}
  ${rosterMarkup(rightRoster, "right")}
`);

await page.locator(".sprite, .element img").first().waitFor({ state: "visible" });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode()));
});
await page.screenshot({ path: outputPath, animations: "disabled" });
await browser.close();

console.log(JSON.stringify({
  outputPath,
  width: base.width,
  height: base.height,
  leftRoster: leftRoster.map(([name]) => name),
  rightRoster: rightRoster.map(([name]) => name)
}, null, 2));
