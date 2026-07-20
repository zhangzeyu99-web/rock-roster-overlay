import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

const sourceUrl =
  "https://wiki.biligame.com/rocom/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4";
const defaultDataDir = path.join(
  process.env.USERPROFILE ?? "C:\\Users\\Administrator",
  "Documents",
  "RockRosterOverlay"
);

const args = parseArgs(process.argv.slice(2));
const dataDir = path.resolve(args.out ?? defaultDataDir);
const htmlPath = args.html ? path.resolve(args.html) : undefined;
const force = readBooleanArg(args, "force");
const dryRun = readBooleanArg(args, "dryRun", "dry-run");
const includeShiny = args.includeShiny !== "false";
const imageWidth = Number(args.imageWidth ?? args["image-width"] ?? 360);
const petsDir = path.join(dataDir, "assets", "pets");
const dataFile = path.join(dataDir, "data", "pets.json");
const reportFile = path.join(dataDir, "data", "bwiki-pokedex-report.json");

const now = new Date().toISOString();

await fs.mkdir(petsDir, { recursive: true });
await fs.mkdir(path.dirname(dataFile), { recursive: true });

const html = htmlPath ? await fs.readFile(htmlPath, "utf8") : await fetchText(sourceUrl);
const cards = parseCards(html);
const sourceCount = Number(html.match(/dex-count-note"><span>精灵<\/span><strong>(\d+)<\/strong>/)?.[1] ?? 0);
const plannedAssets = buildAssets(cards, { includeShiny });

const existingAssets = await readJson(dataFile, []);
const previousById = new Map(existingAssets.map((asset) => [asset.id, asset]));
const customAssets = existingAssets.filter((asset) => !isManagedWorldAsset(asset));

const report = {
  sourceUrl,
  source: "洛克王国：世界 BWIKI 精灵图鉴",
  sourceCount,
  parsedCards: cards.length,
  plannedAssets: plannedAssets.length,
  bossCards: cards.filter((card) => card.stage === "首领" || card.form === "首领形态").length,
  formCards: cards.filter((card) => card.subtitle).length,
  shinyAssets: plannedAssets.filter((asset) => asset.name.includes("（异色）")).length,
  imageWidth,
  removedManagedAssets: existingAssets.length - customAssets.length,
  downloaded: 0,
  reused: 0,
  failed: [],
  warnings: [],
  output: {
    dataDir,
    petsDir,
    dataFile,
    reportFile
  },
  generatedAt: now
};

if (!dryRun) {
  for (const asset of plannedAssets) {
    const targetPath = path.join(petsDir, asset.imagePath);
    try {
      const exists = await fileExists(targetPath);
      if (!force && exists) {
        report.reused += 1;
      } else {
        await downloadFile(asset.sourceUrl, targetPath);
        report.downloaded += 1;
      }

      const alpha = await inspectPngAlpha(targetPath);
      if (!alpha.isPng) {
        report.warnings.push(`${asset.name}: 下载结果不是 PNG`);
      } else if (!alpha.hasAlphaSignal) {
        report.warnings.push(`${asset.name}: PNG 未检测到 alpha/tRNS 透明信号`);
      }
    } catch (error) {
      report.failed.push({
        name: asset.name,
        url: asset.sourceUrl,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

const nextAssets = [
  ...customAssets,
  ...plannedAssets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    aliases: asset.aliases,
    element: asset.element,
    imagePath: asset.imagePath,
    sourceNote: asset.sourceNote,
    updatedAt: previousById.get(asset.id)?.updatedAt ?? now
  }))
];

const duplicateNames = findDuplicateNormalizedNames(nextAssets);
if (duplicateNames.length) {
  report.warnings.push(`归一化名称重复：${duplicateNames.join("、")}`);
}

if (!dryRun) {
  await writeJson(dataFile, nextAssets);
  await writeJson(reportFile, report);
}

console.log(
  JSON.stringify(
    {
      parsedCards: report.parsedCards,
      sourceCount: report.sourceCount,
      plannedAssets: report.plannedAssets,
      downloaded: report.downloaded,
      reused: report.reused,
      failed: report.failed.length,
      warnings: report.warnings.length,
      dryRun,
      dataFile,
      reportFile
    },
    null,
    2
  )
);

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

function readBooleanArg(args, ...keys) {
  return keys.some((key) => args[key] === true || args[key] === "true");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "RockRosterOverlay/0.1 (+local asset sync)"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseCards(html) {
  const cardStart = /<div class="divsort dex-card dex-pet-card[^"]*"/g;
  const starts = [...html.matchAll(cardStart)].map((match) => match.index);
  return starts.map((start, index) => parseCard(html.slice(start, starts[index + 1] ?? html.length), index));
}

function parseCard(chunk, index) {
  const className = chunk.match(/^<div class="([^"]+)"/)?.[1] ?? "";
  const no = decodeHtml(chunk.match(/dex-card-kicker">NO\.([^<]+)</)?.[1] ?? "");
  const stage = decodeHtml(getAttr(chunk, "data-param1"));
  const types = [getAttr(chunk, "data-param2"), getAttr(chunk, "data-param3")]
    .map(decodeHtml)
    .filter(Boolean);
  const form = decodeHtml(getAttr(chunk, "data-param4"));
  const formRole = decodeHtml(getAttr(chunk, "data-param5"));
  const shiny = decodeHtml(getAttr(chunk, "data-param6"));
  const evolution = decodeHtml(getAttr(chunk, "data-param7"));
  const nameMatch = chunk.match(
    /<div class="dex-card-name[^>]*>\s*<a [^>]*title="([^"]*)"[^>]*>(.*?)<\/a>/
  );
  const title = decodeHtml(nameMatch?.[1] ?? "");
  const visibleName = decodeHtml(nameMatch?.[2] ?? title);
  const subtitle = decodeHtml(chunk.match(/<div class="dex-card-subtitle">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const images = [...chunk.matchAll(/<img\s+[^>]*alt="(JL[^"]+\.png)"[^>]*>/g)].map((match) => {
    const tag = match[0];
    const thumbUrl = getTagAttr(tag, "src");
    return {
      alt: decodeHtml(match[1]),
      thumbUrl,
      sourceUrl: selectImageUrl(thumbUrl, getTagAttr(tag, "srcset"), imageWidth)
    };
  });

  return {
    index: index + 1,
    no,
    stage,
    types,
    form,
    formRole,
    shiny,
    evolution,
    className,
    title,
    visibleName,
    subtitle,
    images
  };
}

function getAttr(chunk, name) {
  return chunk.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

function getTagAttr(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#160;|&nbsp;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function selectImageUrl(src, srcset, targetWidth) {
  const candidates = [src]
    .concat(
      srcset
        .split(",")
        .map((item) => item.trim().split(/\s+/)[0])
        .filter(Boolean)
    )
    .map((url) => ({
      url,
      width: Number(url.match(/\/(\d+)px-/)?.[1] ?? 0)
    }))
    .filter((candidate) => candidate.url);

  const sorted = candidates.sort((left, right) => left.width - right.width);
  return (
    sorted.find((candidate) => candidate.width >= targetWidth)?.url ??
    sorted[sorted.length - 1]?.url ??
    src
  );
}

function buildAssets(cards, options) {
  const visibleNameCounts = countValues(cards.map((card) => card.visibleName).filter(Boolean));
  const assets = [];
  for (const card of cards) {
    const baseName = card.title || card.visibleName || `NO.${card.no}`;
    const primary = card.images[0];
    if (!primary) {
      continue;
    }
    assets.push(toAsset(card, primary, baseName, collectAliases(card, baseName, visibleNameCounts)));

    if (!options.includeShiny) {
      continue;
    }

    for (const image of card.images.slice(1)) {
      const lower = image.alt.toLowerCase();
      const suffix = lower.includes("yise") ? "异色" : stemFromAlt(image.alt);
      const variantName = `${baseName}（${suffix}）`;
      const aliases = collectAliases(card, variantName, visibleNameCounts).concat(
        `${baseName}${suffix}`,
        `${card.visibleName}${suffix}`
      );
      assets.push(toAsset(card, image, variantName, uniqueStrings(aliases)));
    }
  }
  return dedupeAssetNames(assets);
}

function toAsset(card, image, name, aliases) {
  const fileName = buildImageFileName(card, image);
  return {
    id: `bwiki-${hash(`${card.no}:${image.alt}:${name}`).slice(0, 16)}`,
    name,
    aliases: uniqueStrings(aliases).filter((alias) => normalizeName(alias) !== normalizeName(name)),
    element: card.types.join("/"),
    imagePath: fileName,
    sourceUrl: image.sourceUrl,
    sourceNote: [
      `BWIKI 精灵图鉴 NO.${card.no}`,
      card.stage,
      card.form,
      card.formRole,
      card.evolution,
      image.alt,
      image.sourceUrl
    ]
      .filter(Boolean)
      .join(" | ")
  };
}

function collectAliases(card, assetName, visibleNameCounts) {
  const aliases = [];
  if (card.visibleName && visibleNameCounts.get(card.visibleName) === 1) {
    aliases.push(card.visibleName);
  }
  if (card.subtitle) {
    aliases.push(`${card.visibleName}${card.subtitle}`, `${card.visibleName} ${card.subtitle}`);
  }
  if (card.stage === "首领" || card.form === "首领形态") {
    aliases.push(`${card.visibleName}首领`, `首领${card.visibleName}`);
  }
  if (assetName.includes("（") && assetName.includes("）")) {
    aliases.push(assetName.replace(/[（）]/g, ""));
  }
  return aliases;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function dedupeAssetNames(assets) {
  const seen = new Map();
  return assets.map((asset) => {
    const normalized = normalizeName(asset.name);
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);
    if (count === 0) {
      return asset;
    }
    const nextName = `${asset.name}（${stemFromFileName(asset.imagePath)}）`;
    return {
      ...asset,
      id: `bwiki-${hash(`${asset.id}:${nextName}`).slice(0, 16)}`,
      name: nextName
    };
  });
}

function buildImageFileName(card, image) {
  const no = card.no || String(card.index).padStart(3, "0");
  const stem = stemFromAlt(image.alt);
  return `${no}-${stem}.png`;
}

function stemFromAlt(alt) {
  return alt
    .replace(/^JL\s+/i, "")
    .replace(/\.png$/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stemFromFileName(fileName) {
  return path.basename(fileName, path.extname(fileName));
}

async function downloadFile(url, targetPath) {
  const response = await fetch(url, {
    headers: {
      referer: sourceUrl,
      "user-agent": "RockRosterOverlay/0.1 (+local asset sync)"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
}

async function inspectPngAlpha(filePath) {
  const buffer = await fs.readFile(filePath);
  const isPng = buffer.length > 33 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) {
    return { isPng: false, hasAlphaSignal: false };
  }
  const colorType = buffer[25];
  return {
    isPng: true,
    hasAlphaSignal: colorType === 4 || colorType === 6 || buffer.includes(Buffer.from("tRNS"))
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findDuplicateNormalizedNames(assets) {
  const seen = new Map();
  const duplicates = new Set();
  for (const asset of assets) {
    const normalized = normalizeName(asset.name);
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      duplicates.add(asset.name);
    } else {
      seen.set(normalized, asset.id);
    }
  }
  return Array.from(duplicates);
}

function normalizeName(input) {
  return String(input)
    .trim()
    .replace(/[\u3000\s]+/g, "")
    .replace(/[\uff01-\uff5e]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase();
}

function isManagedWorldAsset(asset) {
  const id = String(asset?.id ?? "");
  const sourceNote = String(asset?.sourceNote ?? "");
  return (
    id.startsWith("bwiki-") ||
    id.startsWith("4399-world-") ||
    sourceNote.includes("BWIKI 精灵图鉴") ||
    sourceNote.includes("4399 洛克王国：世界")
  );
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    const key = normalizeName(trimmed);
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function hash(input) {
  return createHash("sha1").update(input).digest("hex");
}
