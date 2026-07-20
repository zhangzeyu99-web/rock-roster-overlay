import { describe, expect, it } from "vitest";
import { getPetSuggestions } from "../src/core/suggestions";
import type { PetAsset } from "../src/types";

const assets: PetAsset[] = [
  {
    id: "huadie",
    name: "化蝶",
    aliases: [],
    element: "虫/萌",
    imagePath: "0118-化蝶.png",
    updatedAt: "now"
  },
  {
    id: "yuanhaoyu",
    name: "圆号鱼",
    aliases: [],
    element: "水",
    imagePath: "0990-圆号鱼.png",
    updatedAt: "now"
  },
  {
    id: "nihouya",
    name: "泥吼牙",
    aliases: [],
    element: "地/翼",
    imagePath: "0931-泥吼牙.png",
    updatedAt: "now"
  }
];

describe("pet suggestions", () => {
  it("suggests after the first typed character", () => {
    expect(getPetSuggestions("化", assets).map((item) => item.asset.name)).toEqual(["化蝶"]);
  });

  it("does not suggest stale wrong names", () => {
    expect(getPetSuggestions("泥刚", assets)).toEqual([]);
    expect(getPetSuggestions("跳弓", assets)).toEqual([]);
  });

  it("ranks exact matches before prefix matches", () => {
    expect(getPetSuggestions("圆号鱼", assets).at(0)?.asset.id).toBe("yuanhaoyu");
  });
});
