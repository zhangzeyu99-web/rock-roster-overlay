import type {
  PetAsset,
  ResolvedRosterProject,
  ResolvedRosterSlot,
  RosterProject,
  RosterSlot,
  RosterStyle,
  AssetLibrarySettings,
  FloatingControlSettings,
  TeamSide,
  LiveRosterState
} from "../types";
import { findPetByBaseName, getFormOptions } from "./forms";
import {
  getSlotKey,
  isHealthDefeated,
  normalizeHealthBarStyle,
  normalizeSlotHealth
} from "./health";
import { findPetAsset } from "./matching";
import { normalizeNameLabelStyle } from "./nameLabel";
import { normalizeRoomDesign } from "./room";
import { getResolutionPresetStyleDefaults } from "./captureGeometry";

export const teamSides: TeamSide[] = ["left", "right"];
export const FLOATING_GLASS_STRENGTH_MAX = 140;

export function createDefaultRosterProject(): RosterProject {
  return {
    id: "default",
    name: "默认项目",
    defaultsVersion: 1,
    teams: {
      left: {
        label: "左队",
        slots: Array.from({ length: 6 }, () => ({ name: "", defeated: false }))
      },
      right: {
        label: "右队",
        slots: Array.from({ length: 6 }, () => ({ name: "", defeated: false }))
      }
    },
    style: normalizeRosterStyle(undefined),
    room: normalizeRoomDesign(undefined),
    assetLibrary: normalizeAssetLibrarySettings(undefined),
    floatingControl: normalizeFloatingControlSettings(undefined)
  };
}

export function normalizeSlots(slots: RosterSlot[]): RosterSlot[] {
  const next = slots.slice(0, 6);
  while (next.length < 6) {
    next.push({ name: "" });
  }
  return next;
}

export function applyRosterSlotForm(slot: RosterSlot, asset: PetAsset): RosterSlot {
  const { element: _element, ...rest } = slot;
  return {
    ...rest,
    name: asset.name,
    assetId: asset.id,
    formAssetId: asset.id
  };
}

export function updateRosterSlotName(slot: RosterSlot, name: string): RosterSlot {
  const { assetId: _assetId, formAssetId: _formAssetId, element: _element, ...rest } = slot;
  return {
    ...rest,
    name
  };
}

export function resolveRosterProject(
  project: RosterProject,
  assets: PetAsset[],
  liveState?: LiveRosterState
): ResolvedRosterProject {
  const missingNames: Record<TeamSide, string[]> = { left: [], right: [] };
  const teams = {
    left: resolveTeam(project, assets, "left", missingNames, liveState),
    right: resolveTeam(project, assets, "right", missingNames, liveState)
  };

  return {
    id: project.id,
    name: project.name,
    teams,
    style: normalizeRosterStyle(project.style),
    room: normalizeRoomDesign(project.room),
    missingNames,
    assets
  };
}

function resolveTeam(
  project: RosterProject,
  assets: PetAsset[],
  side: TeamSide,
  missingNames: Record<TeamSide, string[]>,
  liveState?: LiveRosterState
) {
  const team = project.teams[side];
  const healthBarStyle = normalizeHealthBarStyle(project.style.healthBar);
  const slots = normalizeSlots(team.slots).map<ResolvedRosterSlot>((slot, index) => {
    const trimmedName = slot.name.trim();
    const baseAsset = slot.assetId
      ? assets.find((item) => item.id === slot.assetId)
      : findPetAsset(trimmedName, assets) ?? findPetByBaseName(trimmedName, assets);
    const formAsset = slot.formAssetId
      ? assets.find((item) => item.id === slot.formAssetId)
      : undefined;
    const asset = formAsset ?? baseAsset;

    if (trimmedName && !asset) {
      missingNames[side].push(trimmedName);
    }

    const health = normalizeSlotHealth(liveState?.health[getSlotKey(side, index)]);
    return {
      ...slot,
      defeated: (slot.defeated ?? false) || isHealthDefeated(health, healthBarStyle),
      health,
      asset,
      assetId: baseAsset?.id ?? asset?.id ?? slot.assetId,
      formAssetId: asset?.id ?? slot.formAssetId,
      resolvedElement: slot.element ?? asset?.element,
      formOptions: getFormOptions(asset, assets)
    };
  });

  return {
    label: team.label,
    slots
  };
}

export function normalizeRosterStyle(style: Partial<RosterStyle> | undefined): RosterStyle {
  const resolution = normalizeResolution(style?.resolution);
  const presetDefaults = getResolutionPresetStyleDefaults(resolution);
  const legacyDefaultLayout = isLegacyDefaultLayout(style);
  return {
    resolution,
    cardGap: legacyDefaultLayout ? presetDefaults.cardGap : clampNumber(style?.cardGap, 0, 72, presetDefaults.cardGap),
    imageScale: legacyDefaultLayout
      ? presetDefaults.imageScale
      : clampNumber(style?.imageScale, 0.7, 1.7, presetDefaults.imageScale),
    cardBackground: normalizeCardBackground(style?.cardBackground),
    cardPlateOutlineWidth: clampNumber(style?.cardPlateOutlineWidth, 0, 8, 1),
    cardPlateScale: clampNumber(style?.cardPlateScale, 0.7, 1.6, 1.15),
    cardPlateYOffset: clampNumber(style?.cardPlateYOffset, -40, 80, 18),
    showElementIcon: style?.showElementIcon ?? true,
    defeatFilter: {
      grayscale: clampNumber(style?.defeatFilter?.grayscale, 0, 1, 1),
      opacity: clampNumber(style?.defeatFilter?.opacity, 0.1, 1, 0.55)
    },
    obsWindow: {
      width: clampNumber(style?.obsWindow?.width, 240, 1920, 420),
      height: clampNumber(style?.obsWindow?.height, 360, 2160, 1080),
      alwaysOnTop: style?.obsWindow?.alwaysOnTop ?? true,
      clickThrough: style?.obsWindow?.clickThrough ?? true
    },
    teamLayout: {
      mode: normalizeTeamLayoutMode(style?.teamLayout?.mode, presetDefaults.teamLayout.mode ?? "curved"),
      centerGap: legacyDefaultLayout
        ? presetDefaults.teamLayout.centerGap
        : clampNumber(style?.teamLayout?.centerGap, 520, 1720, presetDefaults.teamLayout.centerGap),
      verticalOffset: legacyDefaultLayout
        ? presetDefaults.teamLayout.verticalOffset
        : clampNumber(style?.teamLayout?.verticalOffset, -160, 160, presetDefaults.teamLayout.verticalOffset)
    },
    nameLabel: normalizeNameLabelStyle(style?.nameLabel),
    healthBar: normalizeHealthBarStyle(style?.healthBar)
  };
}

function normalizeTeamLayoutMode(value: unknown, fallback: NonNullable<RosterStyle["teamLayout"]>["mode"]): NonNullable<RosterStyle["teamLayout"]>["mode"] {
  if (value === "vertical") {
    return "vertical";
  }
  return fallback ?? "curved";
}

function normalizeCardBackground(value: unknown): RosterStyle["cardBackground"] {
  if (value === "transparent" || value === "rectangle") {
    return value;
  }
  return "cloud";
}

function isLegacyDefaultLayout(style: Partial<RosterStyle> | undefined): boolean {
  if (!style) {
    return false;
  }
  const cardGapIsLegacyDefault = style.cardGap === undefined || style.cardGap === 14 || style.cardGap === 12;
  const imageScaleIsLegacyDefault = style.imageScale === undefined || style.imageScale === 1 || style.imageScale === 1.08;
  const centerGapIsDefault = style.teamLayout?.centerGap === undefined || style.teamLayout.centerGap === 1540;
  const verticalOffsetIsDefault = style.teamLayout?.verticalOffset === undefined || style.teamLayout.verticalOffset === 0;
  return cardGapIsLegacyDefault && imageScaleIsLegacyDefault && centerGapIsDefault && verticalOffsetIsDefault;
}

export function normalizeAssetLibrarySettings(
  settings: Partial<AssetLibrarySettings> | undefined
): AssetLibrarySettings {
  return {
    showShiny: settings?.showShiny ?? false
  };
}

export function normalizeFloatingControlSettings(
  settings: Partial<FloatingControlSettings> | undefined
): FloatingControlSettings {
  return {
    glassStrength: clampNumber(settings?.glassStrength, 0, FLOATING_GLASS_STRENGTH_MAX, 70),
    uiScale: clampNumber(settings?.uiScale, 0, 100, 60),
    alwaysOnTop: settings?.alwaysOnTop ?? true,
    liveSync: settings?.liveSync ?? true
  };
}

function normalizeResolution(resolution: Partial<RosterStyle["resolution"]> | undefined): RosterStyle["resolution"] {
  return {
    width: clampNumber(resolution?.width, 640, 7680, 1920),
    height: clampNumber(resolution?.height, 360, 4320, 1080)
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
