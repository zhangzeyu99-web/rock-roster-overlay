import { describe, expect, it } from "vitest";
import type { PetAsset, RosterProject } from "../src/types";
import {
  applyQuickImportToProject,
  parseQuickImportText,
  resolveQuickImportEntries
} from "../src/core/quickImport";

const assets: PetAsset[] = [
  createAsset("pet-fire", "火神", "火"),
  createAsset("pet-cat", "魔力猫", "草", ["喵喵王"]),
  createAsset("pet-butterfly", "化蝶", "草/萌"),
  createAsset("pet-blue", "水蓝蓝", "水"),
  createAsset("pet-lord", "烈火战神", "火", [], "火神", "fire-chain"),
  createAsset("pet-branch", "海枝枝（碧蓝珊瑚）", "水", ["海枝枝"], "海枝枝", "haizhizhi")
];

function createAsset(
  id: string,
  name: string,
  element: string,
  aliases: string[] = [],
  baseName?: string,
  chainKey?: string
): PetAsset {
  return {
    id,
    name,
    aliases,
    element,
    baseName,
    chainKey,
    imagePath: `${id}.png`,
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

function createProject(): RosterProject {
  return {
    id: "default",
    name: "默认项目",
    teams: {
      left: { label: "左队", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
      right: { label: "右队", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
    },
    style: {
      resolution: { width: 1920, height: 1080 },
      cardGap: 14,
      imageScale: 1,
      cardBackground: "transparent",
      showElementIcon: true
    }
  };
}

describe("quick import", () => {
  it("splits names by new lines and commas", () => {
    expect(parseQuickImportText("火神\n魔力猫，化蝶, 水蓝蓝")).toEqual([
      "火神",
      "魔力猫",
      "化蝶",
      "水蓝蓝"
    ]);
  });

  it("keeps extra names so the caller can warn before filling the first six", () => {
    expect(parseQuickImportText("A,B,C,D,E,F,G")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("matches exact names, aliases, and base names", () => {
    const entries = resolveQuickImportEntries("喵喵王, 海枝枝, 火神", assets);

    expect(entries.map((entry) => entry.asset?.id)).toEqual([
      "pet-cat",
      "pet-branch",
      "pet-fire"
    ]);
    expect(entries.every((entry) => entry.matched)).toBe(true);
  });

  it("falls back to the closest asset when the input has a small typo", () => {
    const entries = resolveQuickImportEntries("BlazeWarror, MagicCt", [
      createAsset("pet-blaze-warrior", "BlazeWarrior", "fire"),
      createAsset("pet-magic-cat", "MagicCat", "grass")
    ]);

    expect(entries.map((entry) => entry.asset?.id)).toEqual([
      "pet-blaze-warrior",
      "pet-magic-cat"
    ]);
    expect(entries.every((entry) => entry.matched)).toBe(true);
    expect(entries.every((entry) => entry.matchType === "fuzzy")).toBe(true);
  });

  it("fills only the selected side and keeps unmatched names visible", () => {
    const entries = resolveQuickImportEntries("火神, 不存在, 魔力猫", assets);
    const project = applyQuickImportToProject(createProject(), "right", entries);

    expect(project.teams.left.slots.every((slot) => slot.name === "")).toBe(true);
    expect(project.teams.right.slots[0]).toMatchObject({
      name: "火神",
      assetId: "pet-fire",
      formAssetId: "pet-fire",
      element: "火"
    });
    expect(project.teams.right.slots[1].name).toBe("不存在");
    expect(project.teams.right.slots[1].assetId).toBeUndefined();
    expect(project.teams.right.slots[1].formAssetId).toBeUndefined();
    expect(project.teams.right.slots[2]).toMatchObject({
      name: "魔力猫",
      assetId: "pet-cat",
      formAssetId: "pet-cat",
      element: "草"
    });
  });

  it("clears remaining slots when fewer than six names are imported", () => {
    const existing = createProject();
    existing.teams.left.slots = Array.from({ length: 6 }, (_, index) => ({
      name: `old-${index + 1}`,
      assetId: `old-${index + 1}`
    }));

    const project = applyQuickImportToProject(
      existing,
      "left",
      resolveQuickImportEntries("火神, 魔力猫", assets)
    );

    expect(project.teams.left.slots.map((slot) => slot.name)).toEqual([
      "火神",
      "魔力猫",
      "",
      "",
      "",
      ""
    ]);
  });

  it("fills only the first six slots when more names are imported", () => {
    const project = applyQuickImportToProject(
      createProject(),
      "left",
      resolveQuickImportEntries("火神, 魔力猫, 化蝶, 水蓝蓝, 烈火战神, 海枝枝, BlazeWarrior", [
        ...assets,
        createAsset("pet-blaze-warrior", "BlazeWarrior", "fire")
      ])
    );

    expect(project.teams.left.slots.map((slot) => slot.name)).toEqual([
      "火神",
      "魔力猫",
      "化蝶",
      "水蓝蓝",
      "烈火战神",
      "海枝枝（碧蓝珊瑚）"
    ]);
  });

  it("continues into the opposite team when more than six names are imported", () => {
    const project = applyQuickImportToProject(
      createProject(),
      "left",
      resolveQuickImportEntries("火神, 魔力猫, 化蝶, 水蓝蓝, 烈火战神, 海枝枝, 火神, 魔力猫", assets)
    );

    expect(project.teams.left.slots.map((slot) => slot.name)).toEqual([
      "火神",
      "魔力猫",
      "化蝶",
      "水蓝蓝",
      "烈火战神",
      "海枝枝（碧蓝珊瑚）"
    ]);
    expect(project.teams.right.slots.map((slot) => slot.name)).toEqual([
      "火神",
      "魔力猫",
      "",
      "",
      "",
      ""
    ]);
  });

  it("uses the clicked side as the starting team and ignores entries after twelve", () => {
    const project = applyQuickImportToProject(
      createProject(),
      "right",
      resolveQuickImportEntries(
        "火神, 魔力猫, 化蝶, 水蓝蓝, 烈火战神, 海枝枝, 火神, 魔力猫, 化蝶, 水蓝蓝, 烈火战神, 海枝枝, 火神",
        assets
      )
    );

    expect(project.teams.right.slots.map((slot) => slot.name)).toEqual([
      "火神",
      "魔力猫",
      "化蝶",
      "水蓝蓝",
      "烈火战神",
      "海枝枝（碧蓝珊瑚）"
    ]);
    expect(project.teams.left.slots.map((slot) => slot.name)).toEqual([
      "火神",
      "魔力猫",
      "化蝶",
      "水蓝蓝",
      "烈火战神",
      "海枝枝（碧蓝珊瑚）"
    ]);
  });
});
