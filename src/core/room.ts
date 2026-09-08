import type {
  RoomBackgroundStyle,
  RoomBroadcastHud,
  RoomDesign,
  RoomDesignMode,
  RoomGuideStyle,
  RoomPlayerBarStyle,
  RoomTextBox,
  RoomTitleImageStyle
} from "../types";
import { defaultFontFamily, genshinFontFamily } from "./fonts";

export const roomCanvasSize = { width: 1920, height: 1080 };
export const builtinRoomBackground = "builtin:world-room-v3";
export const builtinRoomTitle = "builtin:rock-league-title-v1";
export const builtinS4RoomTitle = "builtin:s4-moon-reverie-title";
export const defaultRoomSeasonTitle = "S3·铅字幻梦";
export const builtinLeftPlayerAvatar = "assets/avatars/001-dimo-avatar.png";
export const builtinRightPlayerAvatar = "assets/avatars/010-shuiling-avatar.png";
export const legacyLeftPlayerAvatar = "builtin:player-avatar-blue";
export const legacyRightPlayerAvatar = "builtin:player-avatar-bunny";
export const roomTitleImageElementId = "room-title-image";

const defaultTextStyle = {
  fontFamily: defaultFontFamily,
  fontSize: 34,
  fontWeight: 800,
  color: "#ffffff",
  fillStyle: "solid" as const,
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  shadowColor: "rgba(5, 12, 24, 0.46)",
  background: "transparent",
  backgroundOpacity: 0,
  borderColor: "transparent",
  borderWidth: 0,
  radius: 0,
  align: "center" as const,
  opacity: 1
};

const competitionTitleLeadStyle = {
  color: "#dbea9b",
  fillStyle: "s3-lead-prism" as const,
  strokeEnabled: true,
  strokeColor: "#527f57",
  strokeWidth: 1,
  shadowColor: "rgba(35, 72, 42, 0.38)",
  fontFamily: defaultFontFamily,
  fontSize: 72,
  fontWeight: 930
};

export const s4MoonTitleStyle: Partial<RoomTextBox> = {
  color: "#e7f4f5",
  fillStyle: "s4-moonlight",
  strokeEnabled: true,
  strokeColor: "#234657",
  strokeWidth: 1,
  shadowColor: "rgba(13, 36, 51, 0.55)",
  background: "transparent",
  backgroundOpacity: 0,
  borderColor: "transparent",
  borderWidth: 0,
  radius: 0
};

const competitionTitleGoldStyle = {
  color: "#ffdc4a",
  fillStyle: "solid" as const,
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  shadowColor: "rgba(118, 74, 0, 0.58)",
  fontFamily: genshinFontFamily,
  fontSize: 90,
  fontWeight: 930
};

const competitionRedStyle = {
  color: "#e42732",
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  shadowColor: "rgba(126, 16, 24, 0.58)",
  fontFamily: genshinFontFamily,
  fontWeight: 920
};

const competitionBlueStyle = {
  color: "#2458e8",
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  shadowColor: "rgba(16, 40, 139, 0.58)",
  fontFamily: genshinFontFamily,
  fontWeight: 920
};

const competitionRedScoreStyle = {
  ...competitionRedStyle,
  fontSize: 118
};

const competitionBlueScoreStyle = {
  ...competitionBlueStyle,
  fontSize: 118
};

const competitionTitleSilverStyle = {
  color: "#f5f9ff",
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  shadowColor: "rgba(35, 83, 164, 0.55)",
  fontFamily: genshinFontFamily,
  fontSize: 84,
  fontWeight: 930
};

const competitionTitleBlueStyle = {
  color: "#2b67ff",
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  shadowColor: "rgba(12, 38, 126, 0.62)",
  fontFamily: genshinFontFamily,
  fontSize: 84,
  fontWeight: 930
};

const competitionTitleRedStyle = {
  color: "#e42732",
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  shadowColor: "rgba(126, 16, 24, 0.58)",
  fontFamily: genshinFontFamily,
  fontSize: 84,
  fontWeight: 930
};

const cleanRoomTitleFrameStyle = {
  strokeEnabled: false,
  strokeColor: "transparent",
  strokeWidth: 0,
  background: "transparent",
  backgroundOpacity: 0,
  borderColor: "transparent",
  borderWidth: 0,
  radius: 0
};

export function getDefaultRoomTitleTextStyle(): Partial<RoomTextBox> {
  return {
    ...cleanRoomTitleFrameStyle,
    ...competitionTitleLeadStyle
  };
}

function getRoomTitleTextPresetStyle(style: Partial<RoomTextBox>): Partial<RoomTextBox> {
  return {
    ...cleanRoomTitleFrameStyle,
    fillStyle: "solid",
    ...style
  };
}

export interface RoomTextStylePreset {
  id: string;
  name: string;
  roles: RoomTextBox["role"][];
  style: Partial<RoomTextBox>;
}

export const roomTextStylePresets: RoomTextStylePreset[] = [
  { id: "s4-moonlight", name: "月涌狂想", roles: ["title"], style: s4MoonTitleStyle },
  {
    id: "s3-lead-prism",
    name: "铅绘幻梦",
    roles: ["title"],
    style: getDefaultRoomTitleTextStyle()
  },
  {
    id: "league-gold",
    name: "联赛金冠",
    roles: ["title"],
    style: getRoomTitleTextPresetStyle(competitionTitleGoldStyle)
  },
  {
    id: "league-white",
    name: "星幕银白",
    roles: ["title"],
    style: getRoomTitleTextPresetStyle(competitionTitleSilverStyle)
  },
  {
    id: "league-blue",
    name: "王国蓝冠",
    roles: ["title"],
    style: getRoomTitleTextPresetStyle(competitionTitleBlueStyle)
  },
  {
    id: "league-red",
    name: "焦点红章",
    roles: ["title"],
    style: getRoomTitleTextPresetStyle(competitionTitleRedStyle)
  },
  {
    id: "player-red",
    name: "红方选手名",
    roles: ["player-left"],
    style: { ...competitionRedStyle, fontSize: 58 }
  },
  {
    id: "player-blue",
    name: "蓝方选手名",
    roles: ["player-right"],
    style: { ...competitionBlueStyle, fontSize: 58 }
  },
  {
    id: "score-red",
    name: "红方比分",
    roles: ["score-left"],
    style: competitionRedScoreStyle
  },
  {
    id: "score-blue",
    name: "蓝方比分",
    roles: ["score-right"],
    style: competitionBlueScoreStyle
  }
];

export function getRoomTextStylePresetsForRole(role: RoomTextBox["role"]) {
  return roomTextStylePresets.filter((preset) => preset.roles.includes(role));
}

export function resolveRoomHudTextAppearance(
  box: RoomTextBox,
  preset: RoomPlayerBarStyle["preset"]
): Pick<RoomTextBox, "fontFamily" | "color"> {
  if (!box.role.startsWith("player-") && !box.role.startsWith("score-")) {
    return { fontFamily: box.fontFamily, color: box.color };
  }
  const score = box.role.startsWith("score-");
  const s4 = preset === "s4-moon-relic";
  const s3 = preset.startsWith("s3-");
  const legacyColor = box.role.endsWith("left") ? "#e42732" : "#2458e8";
  const themeFont = score
    ? s4 ? '"Arial Black", "MiSans", sans-serif'
      : s3 ? '"Arial Black", "Arial", "MiSans", sans-serif'
        : '"Arial Black", "Arial", "MiSans", "Microsoft YaHei UI", sans-serif'
    : s4 ? '"MiSans", sans-serif' : '"MiSans", "Microsoft YaHei UI", sans-serif';
  const themeColor = score
    ? s4 ? "#fff7df"
      : s3 && preset !== "s3-clover-hinge" ? (box.role.endsWith("left") ? "#c83c68" : "#2f78bd")
        : "#ffffff"
    : s4 ? "#214759" : s3 ? "#30451d"
      : preset === "compact" ? "#20242c" : preset === "player-score" ? "#17191f" : "#201a14";
  return {
    fontFamily: box.hudFontOverride || box.fontFamily !== genshinFontFamily ? box.fontFamily : themeFont,
    color: box.hudColorOverride || box.color.toLowerCase() !== legacyColor ? box.color : themeColor
  };
}

export function createDefaultRoomDesign(): RoomDesign {
  return {
    mode: "competition",
    background: createDefaultRoomBackground(),
    textBoxes: createCompetitionTextBoxes(),
    hud: createDefaultRoomHud(),
    guides: createDefaultRoomGuides()
  };
}

export function createDefaultRoomBackground(): RoomBackgroundStyle {
  return {
    visible: false,
    imagePath: builtinRoomBackground,
    fit: "cover",
    opacity: 1,
    dim: 0.12,
    edgeBlur: 0
  };
}

export function createDefaultRoomGuides(): RoomGuideStyle {
  return {
    visible: false,
    mode: "safe"
  };
}

export function createDefaultRoomHud(): RoomBroadcastHud {
  return {
    titleImage: {
      visible: false,
      imagePath: builtinRoomTitle,
      x: 765,
      y: 34,
      width: 390,
      height: 118,
      fit: "contain",
      opacity: 1
    },
    playerBar: {
      visible: true,
      leftVisible: true,
      rightVisible: true,
      scoreVisible: true,
      preset: "s3-clover-hinge",
      boText: "BO5",
      widthScale: 1,
      textScale: 1,
      leftAvatarPath: builtinLeftPlayerAvatar,
      rightAvatarPath: builtinRightPlayerAvatar,
      avatarVisible: false,
      animation: true
    }
  };
}

export function createCompetitionRoomDesign(current?: RoomDesign): RoomDesign {
  const normalized = normalizeRoomDesign(current);
  const existingByRole = new Map(normalized.textBoxes.map((box) => [box.role, box.text]));
  return {
    ...normalized,
    mode: "competition",
    textBoxes: createCompetitionTextBoxes({
      title: existingByRole.get("title"),
      playerLeft: existingByRole.get("player-left"),
      playerRight: existingByRole.get("player-right"),
      scoreLeft: existingByRole.get("score-left"),
      scoreRight: existingByRole.get("score-right")
    })
  };
}

export function normalizeRoomDesign(input?: Partial<RoomDesign>): RoomDesign {
  const fallback = createDefaultRoomDesign();
  const mode: RoomDesignMode = input?.mode === "free" ? "free" : "competition";
  const normalizedTextBoxes = (input?.textBoxes?.length ? input.textBoxes : fallback.textBoxes).map((box, index) =>
    normalizeRoomTextBox(box, index)
  );
  const textBoxes =
    mode === "competition"
      ? [
          ...ensureCompetitionTextBoxes(normalizedTextBoxes),
          ...normalizedTextBoxes.filter((box) => box.role === "custom")
        ]
      : normalizedTextBoxes;

  return {
    mode,
    background: normalizeRoomBackground(input?.background),
    textBoxes,
    hud: normalizeRoomHud(input?.hud),
    guides: normalizeRoomGuides(input?.guides)
  };
}

export function normalizeRoomHud(input?: Partial<RoomBroadcastHud>): RoomBroadcastHud {
  const fallback = createDefaultRoomHud();
  return {
    titleImage: normalizeRoomTitleImage(input?.titleImage, fallback.titleImage),
    playerBar: normalizeRoomPlayerBar(input?.playerBar, fallback.playerBar)
  };
}

function normalizeRoomTitleImage(
  input: Partial<RoomTitleImageStyle> | undefined,
  fallback: RoomTitleImageStyle
): RoomTitleImageStyle {
  const fit = input?.fit === "cover" || input?.fit === "contain" ? input.fit : fallback.fit;
  const width = clampNumber(input?.width, 80, roomCanvasSize.width, fallback.width);
  const height = clampNumber(input?.height, 34, roomCanvasSize.height, fallback.height);
  return {
    visible: typeof input?.visible === "boolean" ? input.visible : fallback.visible,
    imagePath: typeof input?.imagePath === "string" && input.imagePath.trim() ? input.imagePath : fallback.imagePath,
    x: clampNumber(input?.x, 0, roomCanvasSize.width - width, Math.min(fallback.x, roomCanvasSize.width - width)),
    y: clampNumber(input?.y, 0, roomCanvasSize.height - height, Math.min(fallback.y, roomCanvasSize.height - height)),
    width,
    height,
    fit,
    opacity: clampNumber(input?.opacity, 0, 1, fallback.opacity)
  };
}

function normalizeRoomPlayerBar(
  input: Partial<RoomPlayerBarStyle> | undefined,
  fallback: RoomPlayerBarStyle
): RoomPlayerBarStyle {
  const boText = typeof input?.boText === "string" ? input.boText.trim() : fallback.boText;
  const inputPreset = (input as { preset?: unknown } | undefined)?.preset;
  const preset =
    inputPreset === "split-panel" || inputPreset === "score-left" || inputPreset === "score-right"
      ? "classic"
      : inputPreset === "s4-moon-relic" ||
          inputPreset === "s3-storybook" ||
          inputPreset === "s3-prism-bookmark" ||
          inputPreset === "s3-clover-hinge" ||
          inputPreset === "compact" ||
          inputPreset === "player-score" ||
          inputPreset === "classic"
        ? inputPreset
        : fallback.preset;
  return {
    visible: typeof input?.visible === "boolean" ? input.visible : fallback.visible,
    leftVisible: typeof input?.leftVisible === "boolean" ? input.leftVisible : fallback.leftVisible,
    rightVisible: typeof input?.rightVisible === "boolean" ? input.rightVisible : fallback.rightVisible,
    scoreVisible: typeof input?.scoreVisible === "boolean" ? input.scoreVisible : fallback.scoreVisible,
    preset,
    boText,
    showFormat: typeof input?.showFormat === "boolean" ? input.showFormat : undefined,
    vsFontSize: typeof input?.vsFontSize === "number" ? clampNumber(input.vsFontSize, 12, 72, 32) : undefined,
    formatFontSize: typeof input?.formatFontSize === "number" ? clampNumber(input.formatFontSize, 10, 56, 23) : undefined,
    widthScale: clampNumber(input?.widthScale, 0.7, 1.2, fallback.widthScale ?? 1),
    textScale: clampNumber(input?.textScale, 0.7, 1.8, fallback.textScale ?? 1),
    leftAvatarPath:
      typeof input?.leftAvatarPath === "string" && input.leftAvatarPath.trim()
        ? input.leftAvatarPath
        : fallback.leftAvatarPath,
    rightAvatarPath:
      typeof input?.rightAvatarPath === "string" && input.rightAvatarPath.trim()
        ? input.rightAvatarPath
        : fallback.rightAvatarPath,
    avatarVisible: typeof input?.avatarVisible === "boolean" ? input.avatarVisible : fallback.avatarVisible,
    animation: typeof input?.animation === "boolean" ? input.animation : fallback.animation
  };
}

export function createCustomRoomTextBox(index = 0): RoomTextBox {
  return {
    id: createRoomId("room-text"),
    role: "custom",
    text: "自定义文本",
    x: 760 + index * 28,
    y: 470 + index * 28,
    width: 400,
    height: 82,
    ...defaultTextStyle,
    fontSize: 32,
    background: "transparent",
    radius: 0
  };
}

export function normalizeRoomTextBox(input: Partial<RoomTextBox>, index = 0): RoomTextBox {
  const defaults = createCompetitionTextBoxes();
  const fallback = input.role === "custom"
    ? createCustomRoomTextBox(index)
    : defaults.find((box) => box.role === input.role) ?? defaults[index] ?? createCustomRoomTextBox(index);
  const width = clampNumber(input.width, 80, roomCanvasSize.width, fallback.width);
  const height = clampNumber(input.height, 34, roomCanvasSize.height, fallback.height);
  const background = normalizeRoomTextBackground(input.background, fallback.background);
  const backgroundOpacity = normalizeRoomTextBackgroundOpacity(input.backgroundOpacity, background, fallback.backgroundOpacity);
  const strokeWidth = clampNumber(input.strokeWidth, 0, 8, fallback.strokeWidth);
  const strokeEnabled =
    typeof input.strokeEnabled === "boolean"
      ? input.strokeEnabled
      : fallback.strokeEnabled ?? strokeWidth > 0;

  return {
    id: input.id || fallback.id || createRoomId("room-text"),
    role:
      input.role === "title" ||
      input.role === "player-left" ||
      input.role === "player-right" ||
      input.role === "score-left" ||
      input.role === "score-right" ||
      input.role === "custom"
        ? input.role
        : fallback.role,
    text: typeof input.text === "string" ? input.text : fallback.text,
    x: clampNumber(input.x, 0, roomCanvasSize.width - width, fallback.x),
    y: clampNumber(input.y, 0, roomCanvasSize.height - height, fallback.y),
    width,
    height,
    fontFamily: input.fontFamily || fallback.fontFamily,
    fontSize: clampNumber(input.fontSize, 12, 120, fallback.fontSize),
    fontWeight: clampNumber(input.fontWeight, 300, 1000, fallback.fontWeight),
    color: input.color || fallback.color,
    ...(input.hudFontOverride === true ? { hudFontOverride: true } : {}),
    ...(input.hudColorOverride === true ? { hudColorOverride: true } : {}),
    fillStyle:
      input.fillStyle === "s4-moonlight" || input.fillStyle === "s3-lead-prism" || input.fillStyle === "solid"
        ? input.fillStyle
        : fallback.fillStyle ?? "solid",
    strokeEnabled,
    strokeColor: input.strokeColor ?? fallback.strokeColor,
    strokeWidth,
    shadowColor: input.shadowColor ?? fallback.shadowColor,
    background,
    backgroundOpacity,
    borderColor: input.borderColor ?? fallback.borderColor,
    borderWidth: clampNumber(input.borderWidth, 0, 8, fallback.borderWidth),
    radius: clampNumber(input.radius, 0, 60, fallback.radius),
    align:
      input.align === "left" || input.align === "right" || input.align === "center"
        ? input.align
        : fallback.align,
    opacity: clampNumber(input.opacity, 0.05, 1, fallback.opacity)
  };
}

function normalizeRoomTextBackground(value: string | undefined, fallback: string): string {
  if (!value || isLegacyDefaultRoomTextBackground(value)) {
    return fallback;
  }
  return value;
}

function normalizeRoomTextBackgroundOpacity(value: unknown, background: string, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampNumber(value, 0, 1, fallback);
  }
  return background.trim().toLowerCase() === "transparent" ? 0 : 1;
}

function isLegacyDefaultRoomTextBackground(value: string): boolean {
  return ["#242932", "#1f2530", "#26313f"].includes(value.trim().toLowerCase());
}

function createCompetitionTextBoxes(text?: {
  title?: string;
  playerLeft?: string;
  playerRight?: string;
  scoreLeft?: string;
  scoreRight?: string;
}): RoomTextBox[] {
  return [
    {
      id: "room-title",
      role: "title",
      text: text?.title ?? defaultRoomSeasonTitle,
      x: 500,
      y: 38,
      width: 920,
      height: 96,
      ...defaultTextStyle,
      ...competitionTitleLeadStyle
    },
    {
      id: "room-player-left",
      role: "player-left",
      text: text?.playerLeft ?? "左侧选手",
      x: 466,
      y: 112,
      width: 400,
      height: 84,
      ...defaultTextStyle,
      ...competitionRedStyle,
      fontSize: 58
    },
    {
      id: "room-player-right",
      role: "player-right",
      text: text?.playerRight ?? "右侧选手",
      x: 1054,
      y: 112,
      width: 400,
      height: 84,
      ...defaultTextStyle,
      ...competitionBlueStyle,
      fontSize: 58
    },
    {
      id: "room-score-left",
      role: "score-left",
      text: text?.scoreLeft ?? "0",
      x: 206,
      y: 78,
      width: 260,
      height: 132,
      ...defaultTextStyle,
      ...competitionRedScoreStyle
    },
    {
      id: "room-score-right",
      role: "score-right",
      text: text?.scoreRight ?? "0",
      x: 1454,
      y: 78,
      width: 260,
      height: 132,
      ...defaultTextStyle,
      ...competitionBlueScoreStyle
    }
  ];
}

function ensureCompetitionTextBoxes(textBoxes: RoomTextBox[]): RoomTextBox[] {
  const existingByRole = new Map(textBoxes.map((box) => [box.role, box]));
  const legacyTextBoxes = createLegacyCompetitionTextBoxes();
  return createCompetitionTextBoxes().map((fallback, index) => {
    const existing = existingByRole.get(fallback.role);
    const shouldUpgradeLayout =
      existing &&
      legacyTextBoxes.some((legacy) => legacy.role === fallback.role && hasSameRoomTextLayout(existing, legacy));
    const shouldUpgradePreviousS3Title = existing && isPreviousS3LeadTitleDefault(existing);
    const shouldUpgradePreviousS3Color = existing && isPreviousS3CloverTitleDefault(existing);
    return normalizeRoomTextBox(
      existing
        ? {
            ...existing,
            id: existing.id || fallback.id,
            role: fallback.role,
            text: existing.text ?? fallback.text,
            ...((shouldUpgradeLayout && existing.color.toLowerCase() === "#ffffff") ||
            isDefaultCompetitionTextVisual(existing) ||
            isLegacyCompetitionTextVisual(existing, fallback.role)
              ? getCompetitionTextVisualPatch(fallback.role)
              : {}),
            ...(existing.strokeEnabled === false
              ? {
                  strokeEnabled: false,
                  strokeColor: existing.strokeColor,
                  strokeWidth: existing.strokeWidth
                }
              : {}),
            ...(shouldUpgradePreviousS3Title || shouldUpgradePreviousS3Color
              ? { color: fallback.color }
              : {}),
            ...(shouldUpgradeLayout || shouldUpgradePreviousS3Title
              ? {
                  x: fallback.x,
                  y: fallback.y,
                  width: fallback.width,
                  height: fallback.height,
                  fontFamily: fallback.fontFamily,
                  fontSize: fallback.fontSize,
                  fontWeight: fallback.fontWeight
                }
              : {}),
            ...(existing.hudFontOverride ? { fontFamily: existing.fontFamily } : {}),
            ...(existing.hudColorOverride ? { color: existing.color } : {})
          }
        : fallback,
      index
    );
  });
}

function isPreviousS3CloverTitleDefault(box: RoomTextBox): boolean {
  return (
    box.role === "title" &&
    box.fillStyle === "s3-lead-prism" &&
    box.x === 500 &&
    box.y === 38 &&
    box.width === 920 &&
    box.height === 96 &&
    box.fontSize === 72 &&
    box.fontFamily === defaultFontFamily &&
    box.color.trim().toLowerCase() === "#cfe593" &&
    box.strokeColor.trim().toLowerCase() === "#527f57" &&
    box.strokeWidth === 1
  );
}

function isPreviousS3LeadTitleDefault(box: RoomTextBox): boolean {
  return (
    box.role === "title" &&
    box.fillStyle === "s3-lead-prism" &&
    box.x === 500 &&
    box.y === 20 &&
    box.width === 920 &&
    box.height === 108 &&
    box.fontSize === 82 &&
    box.fontFamily === genshinFontFamily &&
    box.color.trim().toLowerCase() === "#cfe593" &&
    box.strokeColor.trim().toLowerCase() === "#527f57" &&
    box.strokeWidth === 1
  );
}

function getCompetitionTextVisualPatch(role: RoomTextBox["role"]): Partial<RoomTextBox> {
  if (role === "title") {
    return getDefaultRoomTitleTextStyle();
  }
  if (role === "player-left" || role === "score-left") {
    return role === "score-left" ? competitionRedScoreStyle : competitionRedStyle;
  }
  if (role === "player-right" || role === "score-right") {
    return role === "score-right" ? competitionBlueScoreStyle : competitionBlueStyle;
  }
  return {};
}

function isDefaultCompetitionTextVisual(box: RoomTextBox): boolean {
  if (box.fillStyle === "solid") return false;
  return (
    box.color.trim().toLowerCase() === "#ffffff" &&
    box.background.trim().toLowerCase() === "transparent" &&
    box.borderColor.trim().toLowerCase() === "transparent" &&
    box.borderWidth === 0
  );
}

function isLegacyCompetitionTextVisual(box: RoomTextBox, role: RoomTextBox["role"]): boolean {
  const color = box.color.trim().toLowerCase();
  const legacyColors =
    role === "title"
      ? ["#ffd84a", "#ffdc4a"]
      : role === "player-left" || role === "score-left"
        ? ["#e73735", "#de2f33"]
        : role === "player-right" || role === "score-right"
          ? ["#275ee8"]
          : [];
  return (
    legacyColors.includes(color) &&
    (role !== "title" || box.fillStyle !== "solid") &&
    box.background.trim().toLowerCase() === "transparent" &&
    box.borderColor.trim().toLowerCase() === "transparent" &&
    box.borderWidth === 0
  );
}

function createLegacyCompetitionTextBoxes(): RoomTextBox[] {
  return [
    {
      ...createCompetitionTextBoxes()[1],
      x: 466,
      y: 118,
      width: 370,
      height: 72,
      fontSize: 52
    },
    {
      ...createCompetitionTextBoxes()[2],
      x: 1084,
      y: 118,
      width: 370,
      height: 72,
      fontSize: 52
    },
    {
      ...createCompetitionTextBoxes()[1],
      x: 492,
      y: 120,
      width: 330,
      height: 62,
      fontSize: 46
    },
    {
      ...createCompetitionTextBoxes()[2],
      x: 1098,
      y: 120,
      width: 330,
      height: 62,
      fontSize: 46
    },
    {
      ...createCompetitionTextBoxes()[1],
      x: 438,
      y: 120,
      width: 330,
      height: 62,
      fontSize: 40,
      fontWeight: 850
    },
    {
      ...createCompetitionTextBoxes()[2],
      x: 1152,
      y: 120,
      width: 330,
      height: 62,
      fontSize: 40,
      fontWeight: 850
    },
    {
      ...createCompetitionTextBoxes()[3],
      x: 172,
      y: 78,
      width: 260,
      height: 132,
      fontSize: 104,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[4],
      x: 1488,
      y: 78,
      width: 260,
      height: 132,
      fontSize: 104,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[0],
      x: 510,
      y: 28,
      width: 900,
      height: 84,
      fontSize: 62,
      fontWeight: 920
    },
    {
      ...createCompetitionTextBoxes()[1],
      x: 438,
      y: 124,
      width: 330,
      height: 54,
      fontSize: 34,
      fontWeight: 850
    },
    {
      ...createCompetitionTextBoxes()[2],
      x: 1152,
      y: 124,
      width: 330,
      height: 54,
      fontSize: 34,
      fontWeight: 850
    },
    {
      ...createCompetitionTextBoxes()[3],
      x: 212,
      y: 88,
      width: 220,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[4],
      x: 1488,
      y: 88,
      width: 220,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[0],
      x: 480,
      y: 22,
      width: 960,
      height: 92,
      fontSize: 66,
      fontWeight: 900
    },
    {
      ...createCompetitionTextBoxes()[1],
      x: 430,
      y: 132,
      width: 330,
      height: 58,
      fontSize: 36
    },
    {
      ...createCompetitionTextBoxes()[2],
      x: 1160,
      y: 132,
      width: 330,
      height: 58,
      fontSize: 36
    },
    {
      ...createCompetitionTextBoxes()[3],
      x: 310,
      y: 94,
      width: 100,
      height: 104,
      fontSize: 86,
      fontWeight: 950
    },
    {
      ...createCompetitionTextBoxes()[4],
      x: 1510,
      y: 94,
      width: 100,
      height: 104,
      fontSize: 86,
      fontWeight: 950
    },
    {
      ...createCompetitionTextBoxes()[3],
      x: 242,
      y: 88,
      width: 190,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[4],
      x: 1488,
      y: 88,
      width: 190,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[3],
      x: 262,
      y: 88,
      width: 170,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[4],
      x: 1488,
      y: 88,
      width: 170,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[3],
      x: 314,
      y: 88,
      width: 118,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[4],
      x: 1488,
      y: 88,
      width: 118,
      height: 114,
      fontSize: 92,
      fontWeight: 960
    },
    {
      ...createCompetitionTextBoxes()[1],
      x: 304,
      y: 122,
      width: 370,
      height: 62,
      fontSize: 38
    },
    {
      ...createCompetitionTextBoxes()[2],
      x: 1246,
      y: 122,
      width: 370,
      height: 62,
      fontSize: 38
    },
    {
      ...createCompetitionTextBoxes()[3],
      x: 198,
      y: 106,
      width: 110,
      height: 92,
      fontSize: 78
    },
    {
      ...createCompetitionTextBoxes()[4],
      x: 1616,
      y: 106,
      width: 110,
      height: 92,
      fontSize: 78
    }
  ];
}

function hasSameRoomTextLayout(left: RoomTextBox, right: RoomTextBox): boolean {
  return (
    Math.abs(left.x - right.x) <= 1 &&
    Math.abs(left.y - right.y) <= 1 &&
    Math.abs(left.width - right.width) <= 1 &&
    Math.abs(left.height - right.height) <= 1
  );
}

function normalizeRoomBackground(input?: Partial<RoomBackgroundStyle>): RoomBackgroundStyle {
  const fallback = createDefaultRoomBackground();
  return {
    visible: input?.visible ?? fallback.visible,
    imagePath: input?.imagePath || fallback.imagePath,
    fit: input?.fit === "contain" ? "contain" : "cover",
    opacity: clampNumber(input?.opacity, 0, 1, fallback.opacity),
    dim: clampNumber(input?.dim, 0, 0.8, fallback.dim),
    edgeBlur: clampNumber(input?.edgeBlur, 0, 80, fallback.edgeBlur)
  };
}

function normalizeRoomGuides(input?: Partial<RoomGuideStyle>): RoomGuideStyle {
  const fallback = createDefaultRoomGuides();
  return {
    visible: input?.visible ?? fallback.visible,
    mode: input?.mode === "center" ? "center" : fallback.mode
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function createRoomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}
