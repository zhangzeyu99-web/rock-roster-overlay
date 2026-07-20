import type { NameLabelStyle } from "../types";
import { defaultFontFamily } from "./fonts";

export interface NameLabelPreset {
  id: string;
  name: string;
  description: string;
  style: NameLabelStyle;
}

export const nameLabelPresets: NameLabelPreset[] = [
  {
    id: "world-battle",
    name: "世界实战",
    description: "贴近游戏内对战名牌：暗灰压条、白字、属性圆压住左侧。",
    style: {
      presetId: "world-battle",
      fontFamily: defaultFontFamily,
      fontSize: 17,
      fontWeight: 630,
      textColor: "#ffffff",
      textShadowColor: "rgba(8, 12, 18, 0.55)",
      backgroundTop: "#3a3f46",
      backgroundBottom: "#3a3f46",
      borderColor: "#3a3f46",
      borderWidth: 0,
      shadowColor: "rgba(10, 15, 22, 0.26)",
      height: 28,
      minWidth: 132,
      horizontalPadding: 13,
      verticalGap: -2
    }
  },
  {
    id: "mist-blue",
    name: "雾蓝压条",
    description: "偏冷的蓝灰底，适合浅色地图和水系、翼系阵容。",
    style: {
      presetId: "mist-blue",
      fontFamily: defaultFontFamily,
      fontSize: 17,
      fontWeight: 680,
      textColor: "#f7fbff",
      textShadowColor: "rgba(8, 23, 38, 0.5)",
      backgroundTop: "#2f5169",
      backgroundBottom: "#2f5169",
      borderColor: "#2f5169",
      borderWidth: 0,
      shadowColor: "rgba(10, 28, 45, 0.26)",
      height: 28,
      minWidth: 132,
      horizontalPadding: 13,
      verticalGap: -1
    }
  },
  {
    id: "slate-soft",
    name: "柔石灰",
    description: "中性石墨灰，降低存在感，适合信息较密的直播画面。",
    style: {
      presetId: "slate-soft",
      fontFamily: defaultFontFamily,
      fontSize: 17,
      fontWeight: 720,
      textColor: "#263140",
      textShadowColor: "rgba(255, 255, 255, 0.62)",
      backgroundTop: "#eceff3",
      backgroundBottom: "#eceff3",
      borderColor: "#eceff3",
      borderWidth: 0,
      shadowColor: "rgba(26, 40, 58, 0.18)",
      height: 28,
      minWidth: 132,
      horizontalPadding: 13,
      verticalGap: -1
    }
  },
  {
    id: "league-night",
    name: "联赛夜金",
    description: "更适合赛事包装的低亮度暖灰底，保留质感但不抢立绘。",
    style: {
      presetId: "league-night",
      fontFamily: defaultFontFamily,
      fontSize: 17,
      fontWeight: 700,
      textColor: "#fff6df",
      textShadowColor: "rgba(29, 19, 10, 0.52)",
      backgroundTop: "#5a4636",
      backgroundBottom: "#5a4636",
      borderColor: "#5a4636",
      borderWidth: 0,
      shadowColor: "rgba(38, 24, 13, 0.24)",
      height: 28,
      minWidth: 132,
      horizontalPadding: 13,
      verticalGap: -1
    }
  }
];

export const defaultNameLabelStyle: NameLabelStyle = {
  ...nameLabelPresets[0].style
};

export function getNameLabelPreset(id: string | undefined): NameLabelPreset {
  return nameLabelPresets.find((preset) => preset.id === id) ?? nameLabelPresets[0];
}

export function getNameLabelPresetStyle(id: string): NameLabelStyle {
  return { ...getNameLabelPreset(id).style };
}

export function normalizeNameLabelStyle(input?: Partial<NameLabelStyle>): NameLabelStyle {
  const preset = getNameLabelPreset(input?.presetId);
  const base = input?.presetId ? preset.style : defaultNameLabelStyle;
  return {
    ...base,
    ...input,
    presetId: input?.presetId ?? defaultNameLabelStyle.presetId,
    fontSize: clampNumber(input?.fontSize, 12, 28, base.fontSize),
    fontWeight: clampNumber(input?.fontWeight, 330, 900, base.fontWeight),
    borderWidth: clampNumber(input?.borderWidth, 0, 4, base.borderWidth),
    height: clampNumber(input?.height, 22, 44, base.height),
    minWidth: clampNumber(input?.minWidth, 64, 180, base.minWidth),
    horizontalPadding: clampNumber(
      input?.horizontalPadding,
      4,
      18,
      base.horizontalPadding
    ),
    verticalGap: clampNumber(input?.verticalGap, -10, 18, base.verticalGap)
  };
}

export function getPetDisplayName(name: string): string {
  const displayName = name.replace(/[（(][^（）()]*[）)]/g, "").trim();
  return displayName || name.trim();
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
