import type { PetAsset } from "../types";

const fullWidthStart = 0xff01;
const fullWidthEnd = 0xff5e;
const asciiOffset = 0xfee0;

export function normalizePetName(input: string): string {
  return input
    .trim()
    .replace(/[\u3000\s]+/g, "")
    .replace(/[\uff01-\uff5e]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - asciiOffset)
    )
    .toLowerCase();
}

export function findPetAsset(input: string, assets: PetAsset[]): PetAsset | undefined {
  const normalized = normalizePetName(input);
  if (!normalized) {
    return undefined;
  }

  const exact = assets.find((asset) => normalizePetName(asset.name) === normalized);
  if (exact) {
    return exact;
  }

  return assets.find((asset) =>
    asset.aliases.some((alias) => normalizePetName(alias) === normalized)
  );
}

export function isFullWidthAscii(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= fullWidthStart && code <= fullWidthEnd;
}
