import { describe, expect, it } from "vitest";
import type { PetAsset } from "../src/types";
import {
  assetLibraryInitialLimit,
  filterAssetLibraryItems,
  getAssetLibraryItems,
  getNextAssetLibraryLimit,
  isShinyAsset
} from "../src/core/assetLibrary";

const assets: PetAsset[] = Array.from({ length: 120 }, (_, index) => ({
  id: `asset-${index}`,
  name: index === 80 ? "海枝枝（碧蓝珊瑚）" : `精灵${index}`,
  aliases: index === 80 ? ["海枝枝"] : [],
  element: "水",
  imagePath: `${index}.png`,
  updatedAt: "now"
}));

describe("asset library", () => {
  it("shows more than a tiny fixed sample and loads more by page", () => {
    const firstPage = getAssetLibraryItems(assets, "", assetLibraryInitialLimit);
    const secondLimit = getNextAssetLibraryLimit(assetLibraryInitialLimit, assets.length);
    const secondPage = getAssetLibraryItems(assets, "", secondLimit);

    expect(firstPage).toHaveLength(assetLibraryInitialLimit);
    expect(secondPage.length).toBeGreaterThan(firstPage.length);
  });

  it("searches globally outside the currently visible page", () => {
    const result = getAssetLibraryItems(assets, "海枝枝", assetLibraryInitialLimit);

    expect(result.map((asset) => asset.name)).toContain("海枝枝（碧蓝珊瑚）");
  });

  it("hides shiny assets by default and shows them when enabled", () => {
    const shinyAsset: PetAsset = {
      id: "shiny",
      name: "霹雳迪迪（异色）",
      aliases: [],
      element: "电",
      imagePath: "shiny.png",
      updatedAt: "now"
    };
    const sourceNoteShinyAsset: PetAsset = {
      id: "source-shiny",
      name: "水蓝蓝",
      aliases: [],
      element: "水",
      imagePath: "source-shiny.png",
      sourceNote: "4399 洛克王国：世界 | 异色",
      updatedAt: "now"
    };
    const library = [...assets.slice(0, 2), shinyAsset, sourceNoteShinyAsset];

    expect(isShinyAsset(shinyAsset)).toBe(true);
    expect(filterAssetLibraryItems(library).map((asset) => asset.id)).toEqual(["asset-0", "asset-1"]);
    expect(filterAssetLibraryItems(library, { showShiny: true }).map((asset) => asset.id)).toContain("shiny");
    expect(getAssetLibraryItems(library, "异色", assetLibraryInitialLimit)).toEqual([]);
    expect(getAssetLibraryItems(library, "异色", assetLibraryInitialLimit, { showShiny: true })).toHaveLength(1);
  });
});
