import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { formatPetFormOptionLabel, getFormOptions, resolvePetForm } from "../src/core/forms";
import type { PetAsset } from "../src/types";

const seedRoot = path.resolve("seed-data");
const petsFile = path.join(seedRoot, "data", "pets.json");
const reportFile = path.join(seedRoot, "data", "bwiki-pokedex-report.json");

function readSeedAssets(): PetAsset[] {
  return JSON.parse(fs.readFileSync(petsFile, "utf8")) as PetAsset[];
}

function getPokedexNo(asset: PetAsset): string | undefined {
  return asset.sourceNote?.match(/\bNO\.(\d+)\b/i)?.[1]?.padStart(3, "0");
}

function isBossAsset(asset: PetAsset): boolean {
  const bossText = "\u9996\u9886";
  return (
    asset.name.includes(bossText) ||
    asset.sourceNote?.includes(bossText) === true ||
    asset.aliases.some((alias) => alias.includes(bossText))
  );
}

function assertTransparentPetPng(asset: PetAsset): void {
  const file = path.join(seedRoot, "assets", "pets", asset.imagePath);
  const png = PNG.sync.read(fs.readFileSync(file));
  const total = png.width * png.height;
  let transparentPixels = 0;
  let paintedPixels = 0;
  const colors = new Set<string>();

  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3];
    if (alpha === 0) {
      transparentPixels += 1;
      continue;
    }
    paintedPixels += 1;
    if (colors.size <= 512) {
      colors.add(`${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]}`);
    }
  }

  expect(png.width).toBeGreaterThanOrEqual(240);
  expect(png.height).toBeGreaterThanOrEqual(240);
  expect(transparentPixels / total).toBeGreaterThan(0.1);
  expect(paintedPixels / total).toBeGreaterThan(0.02);
  expect(colors.size).toBeGreaterThan(128);
}

describe("seed BWIKI pokedex", () => {
  it("uses the current world BWIKI library without old 4399 defaults", () => {
    const assets = readSeedAssets();
    const old4399 = assets.filter(
      (asset) =>
        asset.id.startsWith("4399-world-") ||
        asset.sourceNote?.includes("4399 洛克王国：世界")
    );

    expect(assets).toHaveLength(737);
    expect(old4399).toHaveLength(0);
  });

  it("contains boss, form, shiny, and corrected world names", () => {
    const assets = readSeedAssets();
    const names = new Set(assets.flatMap((asset) => [asset.name, ...asset.aliases]));

    expect(names.has("叶冕魔力猫")).toBe(true);
    expect(names.has("鸭吉吉（紧实的样子）")).toBe(true);
    expect(names.has("鸭吉吉国王（蓬松的样子）")).toBe(true);
    expect(names.has("霜翼领主（春天的样子）")).toBe(true);
    expect(names.has("化蝶（喵喵的样子）")).toBe(true);
    expect(names.has("钻石蜗（西瓜碧玺的样子）")).toBe(true);
    expect(names.has("海枝枝（碧蓝珊瑚）")).toBe(true);
    expect(names.has("海枝枝（杏黄百合）")).toBe(true);
    expect(names.has("海枝枝（洋红沙丁）")).toBe(true);
    expect(names.has("海枝枝（翠绿纶布）")).toBe(true);
    expect(names.has("霹雳迪迪（异色）")).toBe(true);
    expect(names.has("加尔")).toBe(true);
    expect(names.has("黑化加尔")).toBe(true);
    expect(names.has("胡桃王子")).toBe(true);
    expect(names.has("离心舞者")).toBe(true);
    expect(names.has("苞米仔（异色）")).toBe(true);
    expect(names.has("流明坎德拉（异色）")).toBe(true);
    expect(names.has("泥吼牙")).toBe(true);
    expect(names.has("圆号鱼")).toBe(true);
    expect(names.has("泥刚牙")).toBe(false);
    expect(names.has("跳弓鱼")).toBe(false);
  });

  it("references only bundled PNG files", () => {
    const assets = readSeedAssets();
    const missing = assets.filter(
      (asset) => !fs.existsSync(path.join(seedRoot, "assets", "pets", asset.imagePath))
    );

    expect(missing).toHaveLength(0);
  });

  it("ships transparent real pet PNGs for release evidence", () => {
    const assets = readSeedAssets();
    const keyNames = [
      "迪莫",
      "火神",
      "烈火战神",
      "海枝枝（碧蓝珊瑚）",
      "化蝶（喵喵的样子）",
      "霹雳迪迪（异色）"
    ];

    for (const name of keyNames) {
      const asset = assets.find((candidate) => candidate.name === name);
      expect(asset, name).toBeDefined();
      expect(asset?.imagePath).toMatch(/\.png$/);
      assertTransparentPetPng(asset!);
    }
  });

  it("records boss and form coverage in the sync report", () => {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as {
      plannedAssets: number;
      bossCards: number;
      formCards: number;
      shinyAssets: number;
      imageWidth: number;
    };

    expect(report.plannedAssets).toBe(737);
    expect(report.bossCards).toBeGreaterThanOrEqual(61);
    expect(report.formCards).toBeGreaterThanOrEqual(186);
    expect(report.shinyAssets).toBeGreaterThanOrEqual(145);
    expect(report.imageWidth).toBe(360);
  });

  it("keeps every boss asset switchable with same-number forms", () => {
    const assets = readSeedAssets();
    const groups = new Map<string, PetAsset[]>();
    for (const asset of assets) {
      const no = getPokedexNo(asset);
      if (!no) {
        continue;
      }
      groups.set(no, [...(groups.get(no) ?? []), asset]);
    }

    const failures = [...groups.entries()]
      .filter(([, group]) => group.some(isBossAsset))
      .flatMap(([no, group]) => {
        const groupIds = new Set(group.map((asset) => asset.id));
        return group
          .filter(isBossAsset)
          .filter((asset) => {
            const optionIds = new Set(getFormOptions(asset, assets).map((option) => option.id));
            return group.some((candidate) => groupIds.has(candidate.id) && !optionIds.has(candidate.id));
          })
          .map((asset) => `${no}:${asset.name}`);
      });

    expect(failures).toEqual([]);
  });

  it("uses unique display labels for every boss form option group", () => {
    const assets = readSeedAssets();
    const groups = new Map<string, PetAsset[]>();
    for (const asset of assets) {
      const no = getPokedexNo(asset);
      if (!no) {
        continue;
      }
      groups.set(no, [...(groups.get(no) ?? []), asset]);
    }

    const duplicateLabels = [...groups.entries()]
      .filter(([, group]) => group.some(isBossAsset))
      .flatMap(([no, group]) => {
        const seen = new Map<string, string>();
        const duplicates: string[] = [];
        for (const asset of group) {
          const label = formatPetFormOptionLabel(asset, group);
          const existing = seen.get(label);
          if (existing) {
            duplicates.push(`${no}:${label}:${existing}/${asset.name}`);
          }
          seen.set(label, asset.name);
        }
        return duplicates;
      });

    expect(duplicateLabels).toEqual([]);
  });

  it("links starter evolution chains across lower and boss forms", () => {
    const assets = readSeedAssets();
    const fire = assets.find((asset) => asset.name === "\u706b\u82b1");
    const boss = assets.find((asset) => asset.name === "\u70c8\u706b\u6218\u795e");

    expect(fire).toBeDefined();
    expect(boss).toBeDefined();
    expect(getFormOptions(fire, assets).map((asset) => asset.name)).toEqual([
      "\u706b\u82b1",
      "\u7130\u706b",
      "\u706b\u795e",
      "\u70c8\u706b\u6218\u795e"
    ]);
    expect(getFormOptions(boss, assets).map((asset) => asset.name)).toEqual([
      "\u706b\u82b1",
      "\u7130\u706b",
      "\u706b\u795e",
      "\u70c8\u706b\u6218\u795e"
    ]);
  });

  it("links chess black and white branches with one shared final form label", () => {
    const assets = readSeedAssets();
    const qiqi = assets.find((asset) => asset.name === "\u68cb\u68cb\uff08\u767d\u5b50\uff09");

    expect(qiqi).toBeDefined();
    const options = getFormOptions(qiqi, assets);
    expect(options.map((asset) => formatPetFormOptionLabel(asset, options))).toEqual([
      "\u68cb\u68cb\uff08\u767d\u5b50\uff09",
      "\u68cb\u68cb\uff08\u9ed1\u5b50\uff09",
      "\u68cb\u9a91\u58eb\uff08\u767d\u5b50\uff09",
      "\u68cb\u9a91\u58eb\uff08\u9ed1\u5b50\uff09",
      "棋契陛下（白棋棋骑士分支）",
      "棋契陛下（黑棋棋骑士分支）",
      "\u68cb\u9f50\u5792\uff08\u767d\u5b50\uff09",
      "\u68cb\u9f50\u5792\uff08\u9ed1\u5b50\uff09",
      "棋契陛下（白棋棋绮后分支）",
      "棋契陛下（黑棋棋绮后分支）",
      "\u68cb\u7948\u7763\uff08\u767d\u5b50\uff09",
      "\u68cb\u7948\u7763\uff08\u9ed1\u5b50\uff09",
      "棋契陛下（白棋棋齐垒分支）",
      "棋契陛下（黑棋棋齐垒分支）",
      "\u68cb\u7eee\u540e\uff08\u767d\u5b50\uff09",
      "\u68cb\u7eee\u540e\uff08\u9ed1\u5b50\uff09",
      "棋契陛下（白棋棋祈督分支）",
      "棋契陛下（黑棋棋祈督分支）"
    ]);
  });
});
