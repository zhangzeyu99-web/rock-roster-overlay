import { describe, expect, it } from "vitest";
import {
  defaultCaptureWindowStyle,
  getCaptureWindowOptions,
  shouldIgnoreCaptureWindowMouse
} from "../src/core/captureWindow";

describe("capture window mouse behavior", () => {
  it("defaults capture windows to mouse pass-through", () => {
    expect(defaultCaptureWindowStyle.clickThrough).toBe(true);
  });

  it("lets fullscreen capture windows become draggable when mouse pass-through is disabled", () => {
    expect(shouldIgnoreCaptureWindowMouse("overlay", false)).toBe(false);
    expect(shouldIgnoreCaptureWindowMouse("room", false)).toBe(false);
  });

  it("keeps side capture windows controlled by the user setting", () => {
    expect(shouldIgnoreCaptureWindowMouse("left", false)).toBe(false);
    expect(shouldIgnoreCaptureWindowMouse("right", false)).toBe(false);
    expect(shouldIgnoreCaptureWindowMouse("left", true)).toBe(true);
    expect(shouldIgnoreCaptureWindowMouse("right", true)).toBe(true);
  });

  it("restores mouse input after a pass-through capture window gains focus", () => {
    expect(shouldIgnoreCaptureWindowMouse("room", true, true)).toBe(false);
    expect(shouldIgnoreCaptureWindowMouse("left", true, true)).toBe(false);
  });

  it("uses the selected output size for default 1440p side capture windows", () => {
    expect(getCaptureWindowOptions("left", defaultCaptureWindowStyle, { width: 2560, height: 1440 })).toMatchObject({
      width: 560,
      height: 1440
    });
  });

  it("preserves custom side capture window dimensions", () => {
    expect(
      getCaptureWindowOptions(
        "right",
        { width: 680, height: 900, alwaysOnTop: true, clickThrough: false },
        { width: 2560, height: 1440 }
      )
    ).toMatchObject({
      width: 680,
      height: 900,
      ignoreMouseEvents: false
    });
  });
});
