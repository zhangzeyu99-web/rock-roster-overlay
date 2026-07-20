import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const seedRoot = path.join(root, "seed-data");
const petsFile = path.join(seedRoot, "data", "pets.json");
const reportFile = path.join(seedRoot, "data", "bwiki-pokedex-report.json");
const assetRoot = path.join(seedRoot, "assets", "pets");

const requiredNames = [
  "迪莫",
  "火花",
  "焰火",
  "火神",
  "烈火战神",
  "海枝枝（碧蓝珊瑚）",
  "海枝枝（杏黄百合）",
  "海枝枝（洋红沙丁）",
  "海枝枝（翠绿纶布）",
  "棋棋（白子）",
  "棋棋（黑子）",
  "霹雳迪迪（异色）",
  "化蝶（喵喵的样子）",
  "泥吼牙",
  "圆号鱼"
];

const requiredNamePrefixes = ["棋契陛下"];
const forbiddenNames = ["泥刚牙", "跳弓鱼"];
const errors = [];
const warnings = [];

const assets = JSON.parse(await fs.readFile(petsFile, "utf8"));
const report = await readJsonIfExists(reportFile);

if (!Array.isArray(assets)) {
  fail("pets.json is not an array");
}

if (assets.length < 500) {
  errors.push(`asset library too small: ${assets.length}`);
}

if (report?.plannedAssets && report.plannedAssets !== assets.length) {
  errors.push(`sync report plannedAssets=${report.plannedAssets}, pets.json=${assets.length}`);
}

const ids = new Map();
const normalizedNames = new Map();
const namesAndAliases = new Set();
const imagePaths = new Map();

for (const asset of assets) {
  if (!asset?.id || !asset?.name || !Array.isArray(asset.aliases) || !asset?.imagePath) {
    errors.push(`invalid asset shape: ${JSON.stringify(asset)}`);
    continue;
  }

  pushDuplicate(ids, asset.id, asset.name, "duplicate id");
  pushDuplicate(normalizedNames, normalizeName(asset.name), asset.name, "duplicate normalized name");
  pushDuplicate(imagePaths, asset.imagePath, asset.name, "duplicate image path", "warning");

  namesAndAliases.add(asset.name);
  for (const alias of asset.aliases) {
    namesAndAliases.add(alias);
  }

  if (asset.id.startsWith("4399-world-") || asset.sourceNote?.includes("4399 洛克王国：世界")) {
    errors.push(`old 4399 web-source marker remains: ${asset.name}`);
  }

  if (path.extname(asset.imagePath).toLowerCase() !== ".png") {
    errors.push(`non-png bundled pet image: ${asset.name} -> ${asset.imagePath}`);
    continue;
  }

  const filePath = path.join(assetRoot, asset.imagePath);
  try {
    const buffer = await fs.readFile(filePath);
    const stats = inspectPng(buffer);
    if (stats.width < 200 || stats.height < 200) {
      errors.push(`pet image too small: ${asset.name} ${stats.width}x${stats.height}`);
    }
    if (stats.transparentRatio <= 0.01) {
      errors.push(`pet image has no useful transparency: ${asset.name}`);
    }
    if (stats.paintedRatio <= 0.003) {
      errors.push(`pet image has too little visible artwork: ${asset.name}`);
    }
    if (stats.colorCount <= 48) {
      errors.push(`pet image looks placeholder-like: ${asset.name}, colors=${stats.colorCount}`);
    }
    if (stats.width < 240 || stats.height < 240) {
      warnings.push(`pet image below preferred 240px: ${asset.name} ${stats.width}x${stats.height}`);
    }
  } catch (error) {
    errors.push(`missing or unreadable pet image: ${asset.name} -> ${asset.imagePath}: ${error.message}`);
  }
}

for (const name of requiredNames) {
  if (!namesAndAliases.has(name)) {
    errors.push(`required current-world pet missing: ${name}`);
  }
}

for (const prefix of requiredNamePrefixes) {
  if (![...namesAndAliases].some((name) => name.startsWith(prefix))) {
    errors.push(`required current-world pet prefix missing: ${prefix}`);
  }
}

for (const name of forbiddenNames) {
  if (namesAndAliases.has(name)) {
    errors.push(`known wrong pet name still present: ${name}`);
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, assetCount: assets.length, errors, warnings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      assetCount: assets.length,
      reportPlannedAssets: report?.plannedAssets ?? null,
      checkedImages: imagePaths.size,
      warnings
    },
    null,
    2
  )
);

function inspectPng(buffer) {
  const png = PNG.sync.read(buffer);
  const total = png.width * png.height;
  let transparent = 0;
  let painted = 0;
  const colors = new Set();

  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3];
    if (alpha <= 8) {
      transparent += 1;
      continue;
    }
    painted += 1;
    if (colors.size <= 1024) {
      colors.add(`${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]}`);
    }
  }

  return {
    width: png.width,
    height: png.height,
    transparentRatio: transparent / total,
    paintedRatio: painted / total,
    colorCount: colors.size
  };
}

function pushDuplicate(map, key, value, label, severity = "error") {
  if (!key) {
    return;
  }
  const existing = map.get(key);
  if (existing) {
    const issue = `${label}: ${existing} / ${value}`;
    if (severity === "warning") {
      warnings.push(issue);
    } else {
      errors.push(issue);
    }
    return;
  }
  map.set(key, value);
}

function normalizeName(value) {
  return String(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function fail(message) {
  console.error(JSON.stringify({ ok: false, errors: [message] }, null, 2));
  process.exit(1);
}
