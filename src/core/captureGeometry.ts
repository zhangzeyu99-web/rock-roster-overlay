import type { CaptureMode, Resolution, TeamLayoutStyle } from "../types";

export const baseOutputResolution: Resolution = { width: 1920, height: 1080 };
export const sideOutputBaseWidth = 420;

export const outputResolutionPresets: Array<{ id: string; label: string; resolution: Resolution }> = [
  { id: "1080p", label: "1920 x 1080", resolution: { width: 1920, height: 1080 } },
  { id: "1440p", label: "2560 x 1440", resolution: { width: 2560, height: 1440 } }
];

export function getOutputResolutionScale(resolution: Resolution): number {
  const widthScale = resolution.width / baseOutputResolution.width;
  const heightScale = resolution.height / baseOutputResolution.height;
  const scale = Math.min(widthScale, heightScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function getRosterVisualScale(resolution: Resolution): number {
  if (getResolutionPresetId(resolution) === "1440p") {
    return 1.1;
  }
  return getOutputResolutionScale(resolution);
}

export function getSingleTeamOutputWidth(resolution: Resolution): number {
  return Math.max(240, Math.round(sideOutputBaseWidth * (resolution.height / baseOutputResolution.height)));
}

export function getCaptureCanvasSize(mode: CaptureMode, resolution: Resolution): Resolution {
  if (mode === "left" || mode === "right") {
    return {
      width: getSingleTeamOutputWidth(resolution),
      height: resolution.height
    };
  }
  return resolution;
}

export function formatResolution(resolution: Resolution): string {
  return `${resolution.width} x ${resolution.height}`;
}

export function getResolutionPresetId(resolution: Resolution): string {
  return (
    outputResolutionPresets.find(
      (preset) => preset.resolution.width === resolution.width && preset.resolution.height === resolution.height
    )?.id ?? "custom"
  );
}

export interface ResolutionPresetStyleDefaults {
  cardGap: number;
  imageScale: number;
  cardPlateScale: number;
  cardPlateYOffset: number;
  teamLayout: TeamLayoutStyle;
}

export function getResolutionPresetStyleDefaults(resolution: Resolution): ResolutionPresetStyleDefaults {
  const presetId = getResolutionPresetId(resolution);
  if (presetId === "1440p") {
    return {
      cardGap: 8,
      imageScale: 0.96,
      cardPlateScale: 1.02,
      cardPlateYOffset: 22,
      teamLayout: {
        mode: "curved",
        centerGap: 1540,
        verticalOffset: 0
      }
    };
  }

  return {
    cardGap: 8,
    imageScale: 0.96,
    cardPlateScale: 1.02,
    cardPlateYOffset: 22,
    teamLayout: {
      mode: "curved",
      centerGap: 1540,
      verticalOffset: 0
    }
  };
}

export function getRoomLayoutPresetStyleDefaults(
  resolution: Resolution,
  mode: TeamLayoutStyle["mode"],
  theme: "s3" | "s4" = "s3"
): ResolutionPresetStyleDefaults {
  const defaults = getResolutionPresetStyleDefaults(resolution);
  if (theme === "s4") {
    const large = getResolutionPresetId(resolution) === "1440p";
    return { ...defaults, cardGap: large ? 12 : 14, imageScale: large ? 0.94 : 0.90,
      cardPlateScale: 0.96, cardPlateYOffset: 0, teamLayout: { ...defaults.teamLayout, mode } };
  }
  if (mode !== "vertical") {
    return defaults;
  }
  return {
    ...defaults,
    imageScale: 1.02,
    cardPlateScale: 1.08,
    teamLayout: {
      ...defaults.teamLayout,
      mode: "vertical"
    }
  };
}
