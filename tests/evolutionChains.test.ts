import { describe, expect, it } from "vitest";
import { formatPetFormOptionLabel, getFormOptions } from "../src/core/forms";
import type { PetAsset } from "../src/types";

const fireEvolutionAssets: PetAsset[] = [
  {
    id: "fire-1",
    name: "\u706b\u82b1",
    aliases: [],
    element: "\u706b",
    imagePath: "005-huohua.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.005 | \u4e00\u9636 | \u539f\u59cb\u5f62\u6001 | JL huohua.png",
    updatedAt: "now"
  },
  {
    id: "fire-2",
    name: "\u7130\u706b",
    aliases: [],
    element: "\u706b",
    imagePath: "006-yanhuo.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.006 | \u4e8c\u9636 | \u539f\u59cb\u5f62\u6001 | JL yanhuo.png",
    updatedAt: "now"
  },
  {
    id: "fire-3",
    name: "\u706b\u795e",
    aliases: [],
    element: "\u706b",
    imagePath: "007-huoshen.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.007 | \u4e09\u9636 | \u539f\u59cb\u5f62\u6001 | JL huoshen.png",
    updatedAt: "now"
  },
  {
    id: "fire-boss",
    name: "\u70c8\u706b\u6218\u795e",
    aliases: ["\u70c8\u706b\u6218\u795e\u9996\u9886", "\u9996\u9886\u70c8\u706b\u6218\u795e"],
    element: "\u706b",
    imagePath: "007-huoshen_shouling.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.007 | \u9996\u9886\u5f62\u6001 | JL huoshen shouling.png",
    updatedAt: "now"
  }
];

const chessEvolutionAssets: PetAsset[] = [
  makeChess("qiqi-white", "\u68cb\u68cb\uff08\u767d\u5b50\uff09", "188", "\u4e00\u9636"),
  makeChess("qiqi-black", "\u68cb\u68cb\uff08\u9ed1\u5b50\uff09", "188", "\u4e00\u9636"),
  makeChess("knight-white", "\u68cb\u9a91\u58eb\uff08\u767d\u5b50\uff09", "189", "\u4e8c\u9636"),
  makeChess("knight-black", "\u68cb\u9a91\u58eb\uff08\u9ed1\u5b50\uff09", "189", "\u4e8c\u9636"),
  makeChess("king-1", "\u68cb\u5951\u965b\u4e0b\uff08\u7b2c1\u6761\uff09", "189", "\u4e00\u9636", "qiqibixia"),
  makeChess("rook-white", "\u68cb\u9f50\u5792\uff08\u767d\u5b50\uff09", "190", "\u4e8c\u9636"),
  makeChess("rook-black", "\u68cb\u9f50\u5792\uff08\u9ed1\u5b50\uff09", "190", "\u4e8c\u9636"),
  makeChess("king-2", "\u68cb\u5951\u965b\u4e0b\uff08\u7b2c2\u6761\uff09", "190", "\u4e00\u9636", "qiqibixia"),
  makeChess("bishop-white", "\u68cb\u7948\u7763\uff08\u767d\u5b50\uff09", "191", "\u4e8c\u9636"),
  makeChess("bishop-black", "\u68cb\u7948\u7763\uff08\u9ed1\u5b50\uff09", "191", "\u4e8c\u9636"),
  makeChess("king-3", "\u68cb\u5951\u965b\u4e0b\uff08\u7b2c3\u6761\uff09", "191", "\u4e00\u9636", "qiqibixia"),
  makeChess("queen-white", "\u68cb\u7eee\u540e\uff08\u767d\u5b50\uff09", "192", "\u4e8c\u9636"),
  makeChess("queen-black", "\u68cb\u7eee\u540e\uff08\u9ed1\u5b50\uff09", "192", "\u4e8c\u9636"),
  makeChess("king-4", "\u68cb\u5951\u965b\u4e0b\uff08\u7b2c4\u6761\uff09", "192", "\u4e00\u9636", "qiqibixia")
];

function makeChess(id: string, name: string, no: string, stage: string, sourceFile = id): PetAsset {
  const sharedFinal = sourceFile !== id;
  return {
    id,
    name,
    aliases: [],
    element: "\u666e\u901a",
    imagePath: `${id}.png`,
    sourceNote: `BWIKI \u7cbe\u7075\u56fe\u9274 NO.${no} | ${stage} | \u5730\u533a\u5f62\u6001${sharedFinal ? " | \u521d\u59cb|\u6700\u7ec8" : ""} | JL ${sourceFile}.png`,
    updatedAt: "now"
  };
}

describe("evolution chain form options", () => {
  it("includes the full fire evolution and boss chain in both directions", () => {
    expect(getFormOptions(fireEvolutionAssets[0], fireEvolutionAssets).map((asset) => asset.id)).toEqual([
      "fire-1",
      "fire-2",
      "fire-3",
      "fire-boss"
    ]);
    expect(getFormOptions(fireEvolutionAssets[3], fireEvolutionAssets).map((asset) => asset.id)).toEqual([
      "fire-1",
      "fire-2",
      "fire-3",
      "fire-boss"
    ]);
  });

  it("uses pet names as option labels when a chain spans multiple evolution names", () => {
    const options = getFormOptions(fireEvolutionAssets[0], fireEvolutionAssets);

    expect(options.map((asset) => formatPetFormOptionLabel(asset, options))).toEqual([
      "\u706b\u82b1",
      "\u7130\u706b",
      "\u706b\u795e",
      "\u70c8\u706b\u6218\u795e"
    ]);
  });

  it("keeps chess black and white branches plus one shared leader form in one chain", () => {
    const options = getFormOptions(chessEvolutionAssets[0], chessEvolutionAssets);

    expect(options.map((asset) => asset.id)).toEqual([
      "qiqi-white",
      "qiqi-black",
      "knight-white",
      "knight-black",
      "king-1",
      "rook-white",
      "rook-black",
      "bishop-white",
      "bishop-black",
      "queen-white",
      "queen-black"
    ]);
    expect(formatPetFormOptionLabel(options[4], options)).toBe("\u68cb\u5951\u965b\u4e0b");
  });
});
