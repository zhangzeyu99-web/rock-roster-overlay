import type { PetAsset } from "../types";
import { normalizePetName } from "./matching";
import { getPetDisplayName } from "./nameLabel";

export interface ResolvedPetForm extends PetAsset {
  baseName: string;
  chainKey: string;
  formLabel: string;
}

export function resolvePetForm(asset: PetAsset): ResolvedPetForm {
  const baseName = asset.baseName?.trim() || getPetDisplayName(asset.name);
  return {
    ...asset,
    baseName,
    chainKey: asset.chainKey?.trim() || inferSourceChainKey(asset.sourceNote) || normalizePetName(baseName),
    formLabel: asset.formLabel?.trim() || inferFormLabel(asset.name, asset.sourceNote)
  };
}

export function getFormOptions(asset: PetAsset | undefined, assets: PetAsset[]): PetAsset[] {
  if (!asset) {
    return [];
  }

  const chainKeys = buildEvolutionChainKeys(assets);
  const targetChainKey = getOptionChainKey(asset, chainKeys);
  const indexed = new Map(assets.map((candidate, index) => [candidate.id, index]));

  const options = assets
    .filter((candidate) => getOptionChainKey(candidate, chainKeys) === targetChainKey)
    .sort((left, right) => {
      const leftNo = getPokedexNo(left) ?? Number.MAX_SAFE_INTEGER;
      const rightNo = getPokedexNo(right) ?? Number.MAX_SAFE_INTEGER;
      return leftNo - rightNo || (indexed.get(left.id) ?? 0) - (indexed.get(right.id) ?? 0);
    });

  return dedupeSharedFinalForms(options, asset.id);
}

export function formatPetFormOptionLabel(asset: PetAsset, options: PetAsset[]): string {
  if (getSharedFinalFormKey(asset)) {
    const displayName = getPetDisplayName(asset.name);
    const duplicateDisplayNames = options.filter(
      (option) => getSharedFinalFormKey(option) && getPetDisplayName(option.name) === displayName
    );
    return duplicateDisplayNames.length > 1 ? asset.name : displayName;
  }
  const baseNames = new Set(options.map((option) => normalizePetName(resolvePetForm(option).baseName)));
  if (baseNames.size > 1) {
    return asset.name;
  }

  const formLabel = resolvePetForm(asset).formLabel;
  const duplicateLabels = options.filter(
    (option) => !getSharedFinalFormKey(option) && resolvePetForm(option).formLabel === formLabel
  );
  return duplicateLabels.length > 1 ? asset.name : formLabel;
}

export function findPetByBaseName(input: string, assets: PetAsset[]): PetAsset | undefined {
  const normalized = normalizePetName(input);
  if (!normalized) {
    return undefined;
  }

  return assets.find((asset) => normalizePetName(resolvePetForm(asset).baseName) === normalized);
}

function inferFormLabel(name: string, sourceNote?: string): string {
  const isBossForm = name.includes("首领") || sourceNote?.includes("首领");
  const bracketMatch = name.match(/[（(]([^（）()]+)[）)]/);
  if (bracketMatch?.[1]) {
    const suffix = bracketMatch[1];
    return isBossForm && !suffix.includes("首领") ? `首领·${suffix}` : suffix;
  }
  if (isBossForm) {
    return "首领形态";
  }
  if (name.includes("异色") || sourceNote?.includes("异色")) {
    return "异色";
  }
  if (sourceNote?.includes("地区形态")) {
    return "地区形态";
  }
  return "默认";
}

function inferSourceChainKey(sourceNote?: string): string | undefined {
  const pokedexNo = sourceNote?.match(/\bNO\.(\d+)\b/i)?.[1];
  return pokedexNo ? `pokedex-no:${pokedexNo.padStart(3, "0")}` : undefined;
}

function getOptionChainKey(asset: PetAsset, evolutionChainKeys: Map<string, string>): string {
  const manualChainKey = asset.chainKey?.trim();
  if (manualChainKey) {
    return `manual:${manualChainKey}`;
  }
  return evolutionChainKeys.get(asset.id) ?? resolvePetForm(asset).chainKey;
}

function buildEvolutionChainKeys(assets: PetAsset[]): Map<string, string> {
  const chainKeys = new Map<string, string>();
  const groups = new Map<number, PetAsset[]>();

  for (const asset of assets) {
    if (asset.chainKey?.trim()) {
      continue;
    }
    const no = getPokedexNo(asset);
    if (no === undefined) {
      continue;
    }
    groups.set(no, [...(groups.get(no) ?? []), asset]);
  }

  let currentChainKey: string | undefined;
  for (const no of [...groups.keys()].sort((left, right) => left - right)) {
    const group = groups.get(no) ?? [];
    const hasStageOne = group.some((asset) => getEvolutionStageRank(asset) === 1);
    const hasHigherNormalStage = group.some((asset) => {
      const rank = getEvolutionStageRank(asset);
      return rank === 2 || rank === 3;
    });

    if (!currentChainKey || (hasStageOne && !hasHigherNormalStage)) {
      currentChainKey = `evolution:${String(no).padStart(3, "0")}`;
    }

    for (const asset of group) {
      chainKeys.set(asset.id, currentChainKey);
    }
  }

  return chainKeys;
}

function getPokedexNo(asset: PetAsset): number | undefined {
  const rawNo = asset.sourceNote?.match(/\bNO\.(\d+)\b/i)?.[1];
  if (!rawNo) {
    return undefined;
  }
  const no = Number(rawNo);
  return Number.isFinite(no) ? no : undefined;
}

function getEvolutionStageRank(asset: PetAsset): number | undefined {
  const sourceNote = asset.sourceNote ?? "";
  if (sourceNote.includes("一阶")) {
    return 1;
  }
  if (sourceNote.includes("二阶")) {
    return 2;
  }
  if (sourceNote.includes("三阶")) {
    return 3;
  }
  if (asset.name.includes("首领") || sourceNote.includes("首领")) {
    return 4;
  }
  return undefined;
}

function dedupeSharedFinalForms(options: PetAsset[], preferredAssetId: string): PetAsset[] {
  const preferredKey = getSharedFinalFormKey(
    options.find((option) => option.id === preferredAssetId)
  );
  const seen = new Set<string>();

  return options.filter((option) => {
    const key = getSharedFinalFormKey(option);
    if (!key) {
      return true;
    }
    if (key === preferredKey) {
      return option.id === preferredAssetId;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getSharedFinalFormKey(asset: PetAsset | undefined): string | undefined {
  const sourceNote = asset?.sourceNote ?? "";
  if (!asset || !sourceNote.includes("初始|最终")) {
    return undefined;
  }
  const sourceFile =
    sourceNote.match(/(?:^|\|)\s*([^|]*?\.(?:png|webp|jpe?g))\s*(?:\||$)/i)?.[1]?.trim() ??
    asset.imagePath;
  return `${normalizePetName(getPetDisplayName(asset.name))}:${normalizePetName(sourceFile)}`;
}
