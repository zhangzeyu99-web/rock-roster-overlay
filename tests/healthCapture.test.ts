import { describe, expect, it } from "vitest";
import { detectHpPercentFromRegion, smoothHealthPercent } from "../src/core/healthCapture";

describe("health capture detection", () => {
  it("detects a left-filled HP bar from image data", () => {
    const width = 100;
    const height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (x < 63) {
          data[offset] = 42;
          data[offset + 1] = 210;
          data[offset + 2] = 86;
        } else {
          data[offset] = 35;
          data[offset + 1] = 36;
          data[offset + 2] = 40;
        }
        data[offset + 3] = 255;
      }
    }

    const result = detectHpPercentFromRegion({ width, height, data });

    expect(result.percent).toBe(63);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("returns low confidence for empty or invalid regions", () => {
    expect(detectHpPercentFromRegion({ width: 0, height: 8, data: [] })).toEqual({
      percent: 0,
      confidence: 0
    });
    expect(
      detectHpPercentFromRegion({
        width: 12,
        height: 4,
        data: new Uint8ClampedArray(12 * 4 * 4)
      }).confidence
    ).toBeLessThan(0.2);
  });

  it("smooths capture updates without overshooting", () => {
    expect(smoothHealthPercent(100, 40, 0.5)).toBe(70);
    expect(smoothHealthPercent(20, 80, 0)).toBe(80);
  });
});
