import type { PetAsset } from "../types";
import { normalizePetName } from "./matching";

export interface PetSuggestion {
  asset: PetAsset;
  matchedAlias?: string;
  score: number;
}

export function getPetSuggestions(
  input: string,
  assets: PetAsset[],
  limit = 8
): PetSuggestion[] {
  const normalized = normalizePetName(input);
  if (!normalized) {
    return [];
  }

  return assets
    .map((asset) => scorePetSuggestion(asset, normalized))
    .filter((suggestion): suggestion is PetSuggestion => suggestion !== undefined)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      if (left.asset.name.length !== right.asset.name.length) {
        return left.asset.name.length - right.asset.name.length;
      }
      return left.asset.name.localeCompare(right.asset.name, "zh-Hans-CN");
    })
    .slice(0, limit);
}

function scorePetSuggestion(asset: PetAsset, normalizedInput: string): PetSuggestion | undefined {
  const normalizedName = normalizePetName(asset.name);
  const aliasMatches = asset.aliases
    .map((alias) => ({ alias, normalizedAlias: normalizePetName(alias) }))
    .filter((alias) => alias.normalizedAlias);

  if (normalizedName === normalizedInput) {
    return { asset, score: 0 };
  }

  const exactAlias = aliasMatches.find((alias) => alias.normalizedAlias === normalizedInput);
  if (exactAlias) {
    return { asset, matchedAlias: exactAlias.alias, score: 1 };
  }

  if (normalizedName.startsWith(normalizedInput)) {
    return { asset, score: 2 };
  }

  const prefixAlias = aliasMatches.find((alias) => alias.normalizedAlias.startsWith(normalizedInput));
  if (prefixAlias) {
    return { asset, matchedAlias: prefixAlias.alias, score: 3 };
  }

  if (normalizedName.includes(normalizedInput)) {
    return { asset, score: 4 };
  }

  const containsAlias = aliasMatches.find((alias) => alias.normalizedAlias.includes(normalizedInput));
  if (containsAlias) {
    return { asset, matchedAlias: containsAlias.alias, score: 5 };
  }

  return undefined;
}
