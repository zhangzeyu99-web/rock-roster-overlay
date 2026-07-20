import { describe, expect, it } from "vitest";
import { findPetAsset, normalizePetName } from "../src/core/matching";
import type { PetAsset } from "../src/types";

const assets: PetAsset[] = [
  {
    id: "dimo",
    name: "迪莫",
    aliases: ["圣光迪莫"],
    element: "光",
    imagePath: "assets/pets/迪莫.png",
    updatedAt: "2026-06-14T00:00:00.000Z"
  },
  {
    id: "snow",
    name: "雪影娃娃",
    aliases: ["雪影"],
    element: "冰",
    imagePath: "assets/pets/雪影娃娃.png",
    updatedAt: "2026-06-14T00:00:00.000Z"
  }
];

describe("pet name matching", () => {
  it("normalizes spaces and full-width latin characters", () => {
    expect(normalizePetName(" 雪 影 ＡＢＣ ")).toBe("雪影abc");
  });

  it("matches exact names before aliases", () => {
    expect(findPetAsset("迪莫", assets)?.id).toBe("dimo");
  });

  it("matches aliases after exact names", () => {
    expect(findPetAsset(" 雪 影 ", assets)?.id).toBe("snow");
  });

  it("returns undefined for missing assets", () => {
    expect(findPetAsset("不存在", assets)).toBeUndefined();
  });
});
