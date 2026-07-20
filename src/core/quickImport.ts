import type { PetAsset, RosterProject, RosterSlot, TeamSide } from "../types";
import { findPetByBaseName } from "./forms";
import { findPetAsset, normalizePetName } from "./matching";
import { normalizeSlots } from "./project";
import { getPetSuggestions } from "./suggestions";

export interface QuickImportEntry {
  input: string;
  asset?: PetAsset;
  matched: boolean;
  matchType?: "exact" | "suggestion" | "fuzzy";
}

const quickImportSeparators = /[\r\n,，、;；]+/g;

export function parseQuickImportText(input: string): string[] {
  return input
    .split(quickImportSeparators)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveQuickImportEntries(input: string, assets: PetAsset[]): QuickImportEntry[] {
  return parseQuickImportText(input).map((name) => {
    const result = findQuickImportAsset(name, assets);
    return {
      input: name,
      asset: result?.asset,
      matched: Boolean(result?.asset),
      matchType: result?.matchType
    };
  });
}

export function applyQuickImportToProject(
  project: RosterProject,
  side: TeamSide,
  entries: QuickImportEntry[]
): RosterProject {
  const next = structuredClone(project);
  const fillEntries = entries.slice(0, 12);
  const nextSide: TeamSide = side === "left" ? "right" : "left";
  next.teams[side].slots = createSlotsFromEntries(fillEntries.slice(0, 6));
  if (fillEntries.length > 6) {
    next.teams[nextSide].slots = createSlotsFromEntries(fillEntries.slice(6, 12));
  }
  next.teams.left.slots = normalizeSlots(next.teams.left.slots);
  next.teams.right.slots = normalizeSlots(next.teams.right.slots);
  return next;
}

export function findQuickImportAsset(
  name: string,
  assets: PetAsset[]
): { asset: PetAsset; matchType: QuickImportEntry["matchType"] } | undefined {
  const exact = findPetAsset(name, assets) ?? findPetByBaseName(name, assets);
  if (exact) {
    return { asset: exact, matchType: "exact" };
  }

  const suggestion = getPetSuggestions(name, assets, 1)[0]?.asset;
  if (suggestion) {
    return { asset: suggestion, matchType: "suggestion" };
  }

  const fuzzy = findClosestPetAsset(name, assets);
  return fuzzy ? { asset: fuzzy, matchType: "fuzzy" } : undefined;
}

function createSlotFromEntry(entry: QuickImportEntry | undefined): RosterSlot {
  if (!entry) {
    return { name: "", defeated: false };
  }

  if (!entry.asset) {
    return { name: entry.input, defeated: false };
  }

  return {
    name: entry.asset.name,
    assetId: entry.asset.id,
    formAssetId: entry.asset.id,
    element: entry.asset.element,
    defeated: false
  };
}

function createSlotsFromEntries(entries: QuickImportEntry[]): RosterSlot[] {
  return Array.from({ length: 6 }, (_, index) => createSlotFromEntry(entries[index]));
}

function findClosestPetAsset(input: string, assets: PetAsset[]): PetAsset | undefined {
  const normalizedInput = normalizePetName(input);
  if (normalizedInput.length < 2) {
    return undefined;
  }

  const candidates = assets
    .flatMap((asset) =>
      getComparableNames(asset).map((name) => ({
        asset,
        name,
        normalizedName: normalizePetName(name)
      }))
    )
    .filter((candidate) => candidate.normalizedName.length >= 2)
    .map((candidate) => {
      const distance = levenshteinDistance(normalizedInput, candidate.normalizedName);
      const maxLength = Math.max(normalizedInput.length, candidate.normalizedName.length);
      return {
        ...candidate,
        distance,
        ratio: distance / maxLength
      };
    })
    .filter((candidate) => isAcceptableFuzzyMatch(normalizedInput, candidate.normalizedName, candidate.distance, candidate.ratio))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      if (left.ratio !== right.ratio) {
        return left.ratio - right.ratio;
      }
      if (left.normalizedName.length !== right.normalizedName.length) {
        return left.normalizedName.length - right.normalizedName.length;
      }
      return left.asset.name.localeCompare(right.asset.name, "zh-Hans-CN");
    });

  return candidates[0]?.asset;
}

function getComparableNames(asset: PetAsset): string[] {
  return [
    asset.name,
    asset.baseName,
    ...asset.aliases
  ].filter((name): name is string => Boolean(name));
}

function isAcceptableFuzzyMatch(
  input: string,
  candidate: string,
  distance: number,
  ratio: number
): boolean {
  const maxLength = Math.max(input.length, candidate.length);
  const allowedDistance = maxLength <= 3 ? 1 : 2;
  return distance <= allowedDistance && ratio <= 0.34;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}
