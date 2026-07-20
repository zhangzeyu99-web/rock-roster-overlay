import type { PetAsset } from "../types";
import { getPetSuggestions } from "./suggestions";

export const assetLibraryInitialLimit = 48;
export const assetLibraryPageSize = 48;

export function getAssetLibraryItems(
  assets: PetAsset[],
  query: string,
  visibleLimit: number,
  options: { showShiny?: boolean } = {}
): PetAsset[] {
  const libraryAssets = filterAssetLibraryItems(assets, options);
  const limit = clampLimit(visibleLimit, libraryAssets.length);
  if (!query.trim()) {
    return libraryAssets.slice(0, limit);
  }
  return getPetSuggestions(query, libraryAssets, limit).map((suggestion) => suggestion.asset);
}

export function getNextAssetLibraryLimit(current: number, total: number): number {
  return clampLimit(current + assetLibraryPageSize, total);
}

export function getAssetLibraryMatchCount(
  assets: PetAsset[],
  query: string,
  options: { showShiny?: boolean } = {}
): number {
  const libraryAssets = filterAssetLibraryItems(assets, options);
  return query.trim() ? getPetSuggestions(query, libraryAssets, libraryAssets.length).length : libraryAssets.length;
}

export function filterAssetLibraryItems(
  assets: PetAsset[],
  options: { showShiny?: boolean } = {}
): PetAsset[] {
  return options.showShiny ? assets : assets.filter((asset) => !isShinyAsset(asset));
}

export function isShinyAsset(asset: PetAsset): boolean {
  return [asset.name, asset.formLabel, asset.sourceNote, ...(asset.aliases ?? [])].some((value) =>
    value?.includes("异色")
  );
}

function clampLimit(value: number, total: number): number {
  if (!Number.isFinite(value)) {
    return assetLibraryInitialLimit;
  }
  return Math.min(Math.max(assetLibraryInitialLimit, value), total);
}
