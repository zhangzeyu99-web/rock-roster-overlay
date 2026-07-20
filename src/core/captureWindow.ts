import type { CaptureMode, ObsWindowStyle, Resolution } from "../types";
import { getCaptureCanvasSize } from "./captureGeometry";

export const defaultCaptureWindowStyle: ObsWindowStyle = {
  width: 420,
  height: 1080,
  alwaysOnTop: true,
  clickThrough: true
};

export interface CaptureWindowOptions {
  width: number;
  height: number;
  alwaysOnTop: boolean;
  ignoreMouseEvents: boolean;
}

export function isFullscreenCaptureMode(mode: CaptureMode): boolean {
  return mode === "overlay" || mode === "room";
}

export function shouldIgnoreCaptureWindowMouse(mode: CaptureMode, clickThrough: boolean): boolean {
  return clickThrough;
}

export function getCaptureWindowOptions(
  mode: CaptureMode,
  style: ObsWindowStyle | undefined,
  resolution: Resolution
): CaptureWindowOptions {
  const windowStyle = style ?? defaultCaptureWindowStyle;
  const fullscreen = isFullscreenCaptureMode(mode);
  const captureSize = getCaptureCanvasSize(mode, resolution);
  const usesDefaultSideSize =
    windowStyle.width === defaultCaptureWindowStyle.width &&
    windowStyle.height === defaultCaptureWindowStyle.height;

  return {
    width: fullscreen || usesDefaultSideSize ? captureSize.width : windowStyle.width,
    height: fullscreen || usesDefaultSideSize ? captureSize.height : windowStyle.height,
    alwaysOnTop: windowStyle.alwaysOnTop,
    ignoreMouseEvents: shouldIgnoreCaptureWindowMouse(mode, windowStyle.clickThrough)
  };
}
