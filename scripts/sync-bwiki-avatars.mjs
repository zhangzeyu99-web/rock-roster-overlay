import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const petsFile = path.resolve(args.pets ?? path.join(rootDir, "seed-data", "data", "pets.json"));
const avatarDir = path.resolve(args.out ?? path.join(rootDir, "seed-data", "assets", "avatars"));
const manifestFile = path.resolve(args.manifest ?? path.join(rootDir, "seed-data", "data", "avatar-manifest.json"));
const apiBase = "https://wiki.biligame.com/rocom/api.php";
const avatarPrefix = "精灵 头像";
const reportOnly = args["report-only"] === true || args["report-only"] === "true";

await fs.mkdir(avatarDir, { recursive: true });
await fs.mkdir(path.dirname(manifestFile), { recursive: true });

const [pets, avatars] = await Promise.all([readJson(petsFile), fetchAllAvatarImages()]);
const links = linkAvatarSourcesToAssets(
  avatars.map((avatar) => ({
    name: avatarNameFromFile(avatar.name),
    fileName: avatar.name,
    width: avatar.width,
    height: avatar.height,
    size: avatar.size,
    url: avatar.url
  })),
  pets
);

const bestByAsset = new Map();
for (const link of links) {
  if (!link.autoAssignable || !link.matchedAssetId) {
    continue;
  }
  const current = bestByAsset.get(link.matchedAssetId);
  if (!current || rankMatch(link.matchType) > rankMatch(current.matchType)) {
    bestByAsset.set(link.matchedAssetId, link);
  }
}

let downloaded = 0;
const updatedPets = pets.map((pet) => {
  const link = bestByAsset.get(pet.id);
  if (!link?.url) {
    return pet;
  }
  const fileName = avatarFileNameForPet(pet);
  link.localPath = path.join(avatarDir, fileName);
  link.avatarPath = fileName;
  return {
    ...pet,
    avatarPath: fileName
  };
});

if (!reportOnly) {
  for (const link of bestByAsset.values()) {
    if (!link.url || !link.localPath) {
      continue;
    }
    await downloadFile(link.url, link.localPath);
    downloaded += 1;
  }
  await fs.writeFile(petsFile, `${JSON.stringify(updatedPets, null, 2)}\n`, "utf8");
}

const autoAssigned = links.filter((link) => link.autoAssignable && link.matchedAssetId).length;
const report = {
  sourceUrl: `${apiBase}?action=query&list=allimages&aiprefix=${encodeURIComponent(avatarPrefix)}`,
  pets: pets.length,
  avatars: avatars.length,
  matched: links.filter((link) => link.matchedAssetId).length,
  autoAssigned,
  uniqueAssignedAssets: bestByAsset.size,
  riskyBaseMatches: links.filter((link) => link.matchType === "base").length,
  unmatched: links.filter((link) => !link.matchedAssetId).length,
  dimensions: countBy(avatars, (avatar) => `${avatar.width}x${avatar.height}`),
  matchTypes: countBy(links, (link) => link.matchType ?? "unmatched"),
  avatarDir,
  downloaded,
  reportOnly,
  generatedAt: new Date().toISOString(),
  assigned: Array.from(bestByAsset.values()).slice(0, 40),
  needsReview: links.filter((link) => link.matchType === "base").slice(0, 80),
  unmatchedSamples: links.filter((link) => !link.matchedAssetId).slice(0, 80)
};

await fs.writeFile(manifestFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
      headers: { "user-agent": "RockRosterOverlay avatar sync" }
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

function linkAvatarSourcesToAssets(avatars, assets) {
  const index = buildAssetNameIndex(assets);
  return avatars.map((avatar) => {
    const exactAsset = index.exact.get(normalizeAvatarName(avatar.name));
    const baseAsset = index.base.get(normalizeAvatarBaseName(avatar.name));
    const asset = exactAsset ?? baseAsset;
    const matchType = exactAsset ? "exact" : baseAsset ? "base" : undefined;
    return {
      ...avatar,
      matchedAssetId: asset?.id,
      matchedAssetName: asset?.name,
      matchedImagePath: asset?.imagePath,
      matchType,
      autoAssignable: matchType === "exact"
    };
  });
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
      const exactName = normalizeAvatarName(name);
      if (exactName && !exact.has(exactName)) {
        exact.set(exactName, asset);
      }
      const baseName = normalizeAvatarBaseName(name);
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

function stripAvatarVariant(name) {
  return String(name ?? "").replace(/[（(].*?[）)]/g, "").trim();
}

function normalizeAvatarName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s_\-·・:：,，。"'“”‘’()（）]/g, "")
    .toLowerCase();
}

function normalizeAvatarBaseName(value) {
  return normalizeAvatarName(stripAvatarVariant(value));
}

function rankMatch(matchType) {
  return matchType === "exact" ? 3 : matchType === "alias" ? 2 : matchType === "base" ? 1 : 0;
}

function avatarFileNameForPet(pet) {
  const stem = path.basename(pet.imagePath, path.extname(pet.imagePath));
  return sanitizeFileName(`${stem}-avatar.png`);
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
    headers: { "user-agent": "RockRosterOverlay avatar sync" }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  await fs.writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}
