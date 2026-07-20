import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const petsFile = path.resolve(args.pets ?? path.join(rootDir, "seed-data", "data", "pets.json"));
const outDir = path.resolve(args.out ?? path.join(rootDir, "tmp", "avatar-probe"));
const sampleCount = Number(args.sample ?? 16);
const downloadAll = args.all === true || args.all === "true";
const apiBase = "https://wiki.biligame.com/rocom/api.php";
const avatarPrefix = "\u7cbe\u7075 \u5934\u50cf";

await fs.mkdir(outDir, { recursive: true });

const [pets, avatars] = await Promise.all([readJson(petsFile), fetchAllAvatarImages()]);
const assetsByName = buildAssetNameIndex(pets);
const matched = [];
const unmatched = [];

for (const avatar of avatars) {
  const displayName = avatarNameFromFile(avatar.name);
  const exactAsset = assetsByName.exact.get(normalizeExactName(displayName));
  const aliasAsset = assetsByName.exact.get(normalizeExactName(stripVariant(displayName)));
  const baseAsset = assetsByName.base.get(normalizeBaseName(displayName));
  const asset = exactAsset ?? aliasAsset ?? baseAsset;
  const entry = {
    name: displayName,
    fileName: avatar.name,
    width: avatar.width,
    height: avatar.height,
    size: avatar.size,
    url: avatar.url,
    matchedAssetId: asset?.id,
    matchedAssetName: asset?.name,
    matchedImagePath: asset?.imagePath,
    matchType: exactAsset ? "exact" : aliasAsset ? "alias" : baseAsset ? "base" : undefined
  };
  if (asset) {
    matched.push(entry);
  } else {
    unmatched.push(entry);
  }
}

const downloads = downloadAll ? matched : matched.slice(0, sampleCount);
for (const entry of downloads) {
  const fileName = sanitizeFileName(`${entry.name}.png`);
  const target = path.join(outDir, fileName);
  await downloadFile(entry.url, target);
  entry.localPath = target;
}

const report = {
  sourceUrl: `${apiBase}?action=query&list=allimages&aiprefix=${encodeURIComponent(avatarPrefix)}`,
  pets: pets.length,
  avatars: avatars.length,
  matched: matched.length,
  unmatched: unmatched.length,
  dimensions: countBy(avatars, (avatar) => `${avatar.width}x${avatar.height}`),
  matchTypes: countBy(matched, (entry) => entry.matchType ?? "unmatched"),
  downloaded: downloads.length,
  outDir,
  generatedAt: new Date().toISOString(),
  sampleMatched: matched.slice(0, 24),
  sampleUnmatched: unmatched.slice(0, 24)
};

await fs.writeFile(path.join(outDir, "avatar-manifest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fetchAllAvatarImages() {
  const images = [];
  let continuation;
  do {
    const url = new URL(apiBase);
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "allimages");
    url.searchParams.set("aiprefix", avatarPrefix);
    url.searchParams.set("ailimit", "max");
    url.searchParams.set("aiprop", "url|mime|size");
    url.searchParams.set("format", "json");
    if (continuation) {
      url.searchParams.set("aicontinue", continuation);
    }
    const response = await fetch(url, {
      headers: { "user-agent": "RockRosterOverlay avatar probe" }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const body = await response.json();
    images.push(...(body.query?.allimages ?? []));
    continuation = body.continue?.aicontinue;
  } while (continuation);
  return images.filter((image) => image.mime === "image/png" && image.url);
}

function buildAssetNameIndex(assets) {
  const exact = new Map();
  const base = new Map();
  for (const asset of assets) {
    const names = [
      asset.name,
      asset.baseName,
      asset.formLabel ? `${asset.baseName ?? asset.name}${asset.formLabel}` : undefined,
      ...(asset.aliases ?? [])
    ].filter(Boolean);
    for (const name of names) {
      const exactName = normalizeExactName(name);
      if (exactName && !exact.has(exactName)) {
        exact.set(exactName, asset);
      }
      const baseName = normalizeBaseName(name);
      if (baseName && !base.has(baseName)) {
        base.set(baseName, asset);
      }
    }
  }
  return { exact, base };
}

function avatarNameFromFile(fileName) {
  return fileName
    .replace(/^精灵_头像_/, "")
    .replace(/\.png$/i, "")
    .replace(/_/g, " ")
    .trim();
}

function stripVariant(name) {
  return name.replace(/[（(].*?[）)]/g, "").trim();
}

function normalizeExactName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s_\-·・:：,，。"'“”‘’()（）]/g, "")
    .toLowerCase();
}

function normalizeBaseName(value) {
  return normalizeExactName(stripVariant(value));
}

function sanitizeFileName(value) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]));
}

async function downloadFile(url, targetPath) {
  const response = await fetch(url, {
    headers: { "user-agent": "RockRosterOverlay avatar probe" }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  await fs.writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}
