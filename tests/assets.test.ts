import { describe, expect, it } from "vitest";
import { detectDuplicateNames, validateAssetFileName } from "../src/core/assets";
import type { PetAsset } from "../src/types";

describe("asset validation", () => {
  it("accepts png and webp files only", () => {
    expect(validateAssetFileName("迪莫.png").ok).toBe(true);
    expect(validateAssetFileName("雪影.webp").ok).toBe(true);
    expect(validateAssetFileName("说明.txt").ok).toBe(false);
  });

  it("derives the default pet name from the file stem", () => {
    expect(validateAssetFileName("霹雳迪迪.png").derivedName).toBe("霹雳迪迪");
  });

  it("detects duplicate normalized names", () => {
    const pets: PetAsset[] = [
      { id: "a", name: "迪莫", aliases: [], imagePath: "a.png", updatedAt: "now" },
      { id: "b", name: " 迪 莫 ", aliases: [], imagePath: "b.png", updatedAt: "now" }
    ];
    expect(detectDuplicateNames(pets)).toEqual(["迪莫"]);
  });
});
