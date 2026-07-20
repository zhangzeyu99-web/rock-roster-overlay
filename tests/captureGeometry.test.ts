import { describe, expect, it } from "vitest";
import {
  formatResolution,
  getCaptureCanvasSize,
  getResolutionPresetId,
  getSingleTeamOutputWidth,
  outputResolutionPresets
} from "../src/core/captureGeometry";

describe("capture geometry", () => {
  it("keeps full capture modes at the selected output resolution", () => {
    const resolution = { width: 2560, height: 1440 };

    expect(getCaptureCanvasSize("overlay", resolution)).toEqual(resolution);
    expect(getCaptureCanvasSize("room", resolution)).toEqual(resolution);
  });

  it("scales single-team capture width with output height", () => {
    expect(getCaptureCanvasSize("left", { width: 1920, height: 1080 })).toEqual({
      width: 420,
      height: 1080
    });
    expect(getCaptureCanvasSize("right", { width: 2560, height: 1440 })).toEqual({
      width: 560,
      height: 1440
    });
    expect(getSingleTeamOutputWidth({ width: 2560, height: 1440 })).toBe(560);
  });

  it("recognizes built-in resolution presets and custom values", () => {
    expect(outputResolutionPresets.map((preset) => preset.label)).toEqual([
      "1920 x 1080",
      "2560 x 1440"
    ]);
    expect(getResolutionPresetId({ width: 1920, height: 1080 })).toBe("1080p");
    expect(getResolutionPresetId({ width: 2560, height: 1440 })).toBe("1440p");
    expect(getResolutionPresetId({ width: 2400, height: 1350 })).toBe("custom");
    expect(formatResolution({ width: 560, height: 1440 })).toBe("560 x 1440");
  });
});
