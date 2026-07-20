import { describe, expect, it } from "vitest";
import {
  avatarNameFromFile,
  assessAvatarRankConfidence,
  compareAvatarSignatures,
  createAvatarSignature,
  createAvatarShapeSignature,
  findBestAvatarMatch,
  getAvatarAssistReadiness,
  linkAvatarSourcesToAssets,
  resolveStableAvatarDecision,
  type AvatarImageData
} from "../src/core/avatarMatching";
import type { PetAsset } from "../src/types";

describe("avatar matching", () => {
  it("builds stable signatures and matches the closest roster avatar", () => {
    const fire = createAvatarSignature(makeImage(24, 24, (x, y) => [230, 70 + x * 2, 28 + y, 255]));
    const water = createAvatarSignature(makeImage(24, 24, (x, y) => [30 + x, 118, 230 - y, 255]));
    const candidate = createAvatarSignature(makeImage(24, 24, (x, y) => [228, 72 + x * 2, 30 + y, 255]));

    const result = findBestAvatarMatch(candidate, [
      { assetId: "fire", name: "火神", signature: fire },
      { assetId: "water", name: "水灵", signature: water }
    ]);

    expect(result).toMatchObject({
      matched: true,
      assetId: "fire",
      name: "火神"
    });
    expect(result.score).toBeGreaterThan(0.95);
    expect(result.runnerUpScore).toBeLessThan(0.75);
  });

  it("rejects ambiguous avatar matches when the score margin is too small", () => {
    const left = createAvatarSignature(makeImage(16, 16, () => [180, 90, 90, 255]));
    const right = createAvatarSignature(makeImage(16, 16, () => [182, 92, 92, 255]));
    const candidate = createAvatarSignature(makeImage(16, 16, () => [181, 91, 91, 255]));

    const result = findBestAvatarMatch(candidate, [
      { assetId: "left", name: "左", signature: left },
      { assetId: "right", name: "右", signature: right }
    ]);

    expect(result.matched).toBe(false);
    expect(result.score).toBeGreaterThan(0.99);
    expect(result.score - result.runnerUpScore).toBeLessThan(0.045);
  });

  it("matches a color-filtered avatar by shape instead of raw color", () => {
    const original = createAvatarShapeSignature(makeImage(28, 28, (x, y) => {
      const stripe = Math.abs(x - y) <= 3 || (x > 16 && y < 10);
      return stripe ? [230, 240, 255, 255] : [42, 64, 96, 255];
    }));
    const filtered = createAvatarShapeSignature(makeImage(28, 28, (x, y) => {
      const stripe = Math.abs(x - y) <= 3 || (x > 16 && y < 10);
      return stripe ? [255, 90, 150, 255] : [74, 20, 38, 255];
    }));
    const colorSimilarWrongShape = createAvatarShapeSignature(makeImage(28, 28, (x, y) => {
      const block = x < 14;
      return block ? [255, 92, 148, 255] : [74, 22, 36, 255];
    }));

    const result = findBestAvatarMatch(filtered, [
      { assetId: "original", name: "original", signature: original },
      { assetId: "wrong-shape", name: "wrong-shape", signature: colorSimilarWrongShape }
    ], { minScore: 0.82, minMargin: 0.04 });

    expect(result).toMatchObject({
      matched: true,
      assetId: "original"
    });
    expect(compareAvatarSignatures(filtered, original)).toBeGreaterThan(compareAvatarSignatures(filtered, colorSimilarWrongShape));
  });

  it("treats near-tied HUD avatar rankings as uncertain instead of trusting full-library top one", () => {
    const result = assessAvatarRankConfidence([
      { assetId: "xiaorongjian", name: "小绒茧", score: 0.9714206457138062 },
      { assetId: "chuitouguan", name: "锤头鹳", score: 0.9708318114280701 },
      { assetId: "lanzhutianer", name: "蓝珠天鹅", score: 0.9691781997680664 }
    ]);

    expect(result).toMatchObject({
      matched: false,
      reason: "ambiguous",
      score: 0.971,
      runnerUpScore: 0.971
    });
    expect(result.margin).toBeLessThan(0.015);
    expect(result.assetId).toBeUndefined();
  });

  it("accepts HUD avatar rankings when the current-roster candidate margin is clear", () => {
    const result = assessAvatarRankConfidence([
      { assetId: "chuitouguan", name: "锤头鹳", score: 0.9674143195152283 },
      { assetId: "nihouya", name: "泥吼牙", score: 0.9254551529884338 },
      { assetId: "heiyufuren", name: "黑羽夫人", score: 0.9168853759765625 }
    ]);

    expect(result).toMatchObject({
      matched: true,
      assetId: "chuitouguan",
      name: "锤头鹳",
      reason: "matched"
    });
    expect(result.margin).toBeGreaterThan(0.015);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("classifies avatar assist slots by readiness instead of a binary has-avatar flag", () => {
    const normal = makePetAsset("normal", "白金独角兽", "117-baijindujiaoshou-avatar.png", "白金独角兽");
    const shinyWithAvatar = makePetAsset("shiny", "白金独角兽（异色）", "117-baijindujiaoshou-yise-avatar.png", "白金独角兽");
    const missingShinyAvatar = makePetAsset("missing", "落陨星兔（信使精灵）（异色）", undefined, "落陨星兔");
    const sameBase = makePetAsset("same-base", "白金独角兽（首领）", "117-baijindujiaoshou-boss-avatar.png", "白金独角兽");

    expect(getAvatarAssistReadiness({ asset: normal }, [normal])).toMatchObject({
      status: "ready",
      canAutoApply: true
    });
    expect(getAvatarAssistReadiness({ asset: shinyWithAvatar }, [shinyWithAvatar])).toMatchObject({
      status: "review",
      canAutoApply: false
    });
    expect(getAvatarAssistReadiness({ asset: missingShinyAvatar }, [missingShinyAvatar])).toMatchObject({
      status: "missing",
      canAutoApply: false
    });
    expect(getAvatarAssistReadiness({ asset: normal }, [normal, sameBase])).toMatchObject({
      status: "review",
      canAutoApply: false
    });
  });

  it("waits for repeated stable avatar frames before auto-selecting a HUD candidate", () => {
    const result = resolveStableAvatarDecision([
      [
        { assetId: "chuitouguan", name: "hammer", score: 0.9674 },
        { assetId: "nihouya", name: "mud", score: 0.9254 }
      ],
      [
        { assetId: "chuitouguan", name: "hammer", score: 0.9631 },
        { assetId: "nihouya", name: "mud", score: 0.9201 }
      ],
      [
        { assetId: "chuitouguan", name: "hammer", score: 0.9688 },
        { assetId: "heiyufuren", name: "black", score: 0.9168 }
      ]
    ]);

    expect(result).toMatchObject({
      matched: true,
      assetId: "chuitouguan",
      reason: "stable"
    });
    expect(result.stableFrameCount).toBe(3);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("does not auto-select a HUD candidate when recent frames disagree", () => {
    const result = resolveStableAvatarDecision([
      [
        { assetId: "chuitouguan", name: "hammer", score: 0.9674 },
        { assetId: "nihouya", name: "mud", score: 0.9254 }
      ],
      [
        { assetId: "nihouya", name: "mud", score: 0.9661 },
        { assetId: "chuitouguan", name: "hammer", score: 0.9231 }
      ],
      [
        { assetId: "chuitouguan", name: "hammer", score: 0.9688 },
        { assetId: "heiyufuren", name: "black", score: 0.9168 }
      ]
    ]);

    expect(result).toMatchObject({
      matched: false,
      reason: "unstable"
    });
    expect(result.assetId).toBeUndefined();
  });

  it("penalizes transparent coverage mismatch", () => {
    const full = createAvatarSignature(makeImage(16, 16, () => [80, 200, 120, 255]));
    const half = createAvatarSignature(makeImage(16, 16, (x) => [80, 200, 120, x < 8 ? 255 : 0]));

    expect(compareAvatarSignatures(full, half)).toBeLessThan(0.95);
  });

  it("links BWiki avatar names to pet assets without auto-assigning risky base-name matches", () => {
    const assets: PetAsset[] = [
      {
        id: "cat",
        name: "魔力猫",
        aliases: ["魔力喵"],
        imagePath: "cat.png",
        updatedAt: "2026-06-22T00:00:00.000Z"
      },
      {
        id: "diudiu-grass",
        name: "丢丢（草地附近的样子）",
        aliases: [],
        baseName: "丢丢",
        imagePath: "diudiu.png",
        updatedAt: "2026-06-22T00:00:00.000Z"
      }
    ];

    const links = linkAvatarSourcesToAssets(
      [
        { name: "魔力猫", fileName: "精灵_头像_魔力猫.png" },
        { name: "魔力喵", fileName: "精灵_头像_魔力喵.png" },
        { name: "丢丢（火山附近的样子）", fileName: "精灵_头像_丢丢（火山附近的样子）.png" }
      ],
      assets
    );

    expect(links[0]).toMatchObject({ matchedAssetId: "cat", matchType: "exact", autoAssignable: true });
    expect(links[1]).toMatchObject({ matchedAssetId: "cat", matchType: "exact", autoAssignable: true });
    expect(links[2]).toMatchObject({ matchedAssetId: "diudiu-grass", matchType: "base", autoAssignable: false });
  });

  it("extracts display names from BWiki avatar file names", () => {
    expect(avatarNameFromFile("精灵_头像_海枝枝（碧蓝珊瑚）.png")).toBe("海枝枝（碧蓝珊瑚）");
  });
});

function makeImage(
  width: number,
  height: number,
  getPixel: (x: number, y: number) => [number, number, number, number]
): AvatarImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha] = getPixel(x, y);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = alpha;
    }
  }
  return { width, height, data };
}

function makePetAsset(id: string, name: string, avatarPath?: string, baseName?: string): PetAsset {
  return {
    id,
    name,
    aliases: [],
    imagePath: `${id}.png`,
    avatarPath,
    baseName,
    updatedAt: "2026-06-23T00:00:00.000Z"
  };
}
