import path from "node:path";
import type { PetAsset } from "../types";
import { normalizePetName } from "./matching";

const supportedExtensions = new Set([".png", ".webp"]);

export interface AssetFileValidation {
  ok: boolean;
  derivedName: string;
  reason?: string;
}

export function validateAssetFileName(fileName: string): AssetFileValidation {
  const extension = path.extname(fileName).toLowerCase();
  const derivedName = path.basename(fileName, extension).trim();

  if (!supportedExtensions.has(extension)) {
    return {
      ok: false,
      derivedName,
      reason: "仅支持 PNG / WebP"
    };
  }

  if (!derivedName) {
    return {
      ok: false,
      derivedName,
      reason: "文件名不能为空"
    };
  }

  return { ok: true, derivedName };
}

export function detectDuplicateNames(assets: PetAsset[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const asset of assets) {
    const normalized = normalizePetName(asset.name);
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      duplicates.add(asset.name.trim().replace(/\s+/g, ""));
    } else {
      seen.set(normalized, asset.id);
    }
  }

  return Array.from(duplicates);
}
