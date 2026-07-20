import type { PetAsset } from "../types";

export interface AvatarImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array | number[];
}

export interface AvatarSignature {
  size: number;
  vector: number[];
  alphaCoverage: number;
}

export interface AvatarReference {
  assetId: string;
  name: string;
  signature: AvatarSignature;
}

export interface AvatarMatchOptions {
  minScore?: number;
  minMargin?: number;
}

export interface AvatarMatchResult {
  matched: boolean;
  assetId?: string;
  name?: string;
  score: number;
  runnerUpScore: number;
  confidence: number;
}

export interface AvatarRankCandidate {
  assetId?: string;
  name: string;
  score: number;
}

export type AvatarRankConfidenceReason = "matched" | "ambiguous" | "low-score" | "empty";

export interface AvatarRankConfidenceOptions {
  minScore?: number;
  minMargin?: number;
}

export interface AvatarRankConfidenceResult extends AvatarMatchResult {
  margin: number;
  reason: AvatarRankConfidenceReason;
}

export type AvatarStableDecisionReason = AvatarRankConfidenceReason | "stable" | "unstable";

export interface AvatarStableDecisionOptions extends AvatarRankConfidenceOptions {
  minStableFrames?: number;
  maxFrames?: number;
}

export interface AvatarStableDecisionResult extends AvatarMatchResult {
  margin: number;
  reason: AvatarStableDecisionReason;
  stableFrameCount: number;
  consideredFrameCount: number;
}

export interface AvatarSourceRecord {
  name: string;
  fileName: string;
  width?: number;
  height?: number;
  size?: number;
  url?: string;
}

export interface AvatarAssetLink extends AvatarSourceRecord {
  matchedAssetId?: string;
  matchedAssetName?: string;
  matchedImagePath?: string;
  matchType?: "exact" | "alias" | "base";
  autoAssignable: boolean;
}

export type AvatarAssistReadinessStatus = "ready" | "review" | "missing" | "empty";

export interface AvatarAssistSlotInput {
  name?: string;
  asset?: PetAsset;
}

export interface AvatarAssistReadiness {
  status: AvatarAssistReadinessStatus;
  title: string;
  detail: string;
  canAutoApply: boolean;
}

const defaultSignatureSize = 16;

export function createAvatarSignature(
  imageData: AvatarImageData,
  size = defaultSignatureSize
): AvatarSignature {
  const safeSize = clampInteger(size, 4, 32, defaultSignatureSize);
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { size: safeSize, vector: Array.from({ length: safeSize * safeSize * 3 }, () => 1), alphaCoverage: 0 };
  }

  const vector: number[] = [];
  let opaqueCells = 0;

  for (let cellY = 0; cellY < safeSize; cellY += 1) {
    for (let cellX = 0; cellX < safeSize; cellX += 1) {
      const startX = Math.floor((cellX / safeSize) * width);
      const endX = Math.max(startX + 1, Math.floor(((cellX + 1) / safeSize) * width));
      const startY = Math.floor((cellY / safeSize) * height);
      const endY = Math.max(startY + 1, Math.floor(((cellY + 1) / safeSize) * height));
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let y = startY; y < Math.min(endY, height); y += 1) {
        for (let x = startX; x < Math.min(endX, width); x += 1) {
          const offset = (y * width + x) * 4;
          const weight = (data[offset + 3] ?? 255) / 255;
          red += (data[offset] ?? 255) * weight;
          green += (data[offset + 1] ?? 255) * weight;
          blue += (data[offset + 2] ?? 255) * weight;
          alpha += weight;
        }
      }

      if (alpha > 0.01) {
        opaqueCells += 1;
        vector.push(red / alpha / 255, green / alpha / 255, blue / alpha / 255);
      } else {
        vector.push(1, 1, 1);
      }
    }
  }

  return {
    size: safeSize,
    vector,
    alphaCoverage: opaqueCells / (safeSize * safeSize)
  };
}

export function createAvatarShapeSignature(
  imageData: AvatarImageData,
  size = defaultSignatureSize
): AvatarSignature {
  const safeSize = clampInteger(size, 4, 32, defaultSignatureSize);
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { size: safeSize, vector: Array.from({ length: safeSize * safeSize * 2 }, () => 0.5), alphaCoverage: 0 };
  }

  const lumaCells: number[] = [];
  const opaqueCells: boolean[] = [];
  let opaqueCellCount = 0;

  for (let cellY = 0; cellY < safeSize; cellY += 1) {
    for (let cellX = 0; cellX < safeSize; cellX += 1) {
      const startX = Math.floor((cellX / safeSize) * width);
      const endX = Math.max(startX + 1, Math.floor(((cellX + 1) / safeSize) * width));
      const startY = Math.floor((cellY / safeSize) * height);
      const endY = Math.max(startY + 1, Math.floor(((cellY + 1) / safeSize) * height));
      let luma = 0;
      let alpha = 0;

      for (let y = startY; y < Math.min(endY, height); y += 1) {
        for (let x = startX; x < Math.min(endX, width); x += 1) {
          const offset = (y * width + x) * 4;
          const weight = (data[offset + 3] ?? 255) / 255;
          const red = (data[offset] ?? 255) / 255;
          const green = (data[offset + 1] ?? 255) / 255;
          const blue = (data[offset + 2] ?? 255) / 255;
          luma += (red * 0.299 + green * 0.587 + blue * 0.114) * weight;
          alpha += weight;
        }
      }

      const isOpaque = alpha > 0.01;
      opaqueCells.push(isOpaque);
      if (isOpaque) {
        opaqueCellCount += 1;
        lumaCells.push(luma / alpha);
      } else {
        lumaCells.push(0.5);
      }
    }
  }

  const opaqueLumaValues = lumaCells.filter((_, index) => opaqueCells[index]);
  const mean =
    opaqueLumaValues.reduce((total, value) => total + value, 0) / Math.max(1, opaqueLumaValues.length);
  const variance =
    opaqueLumaValues.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, opaqueLumaValues.length);
  const deviation = Math.max(Math.sqrt(variance), 0.0001);
  const normalizedLuma = lumaCells.map((value, index) =>
    opaqueCells[index] ? clampNumber(0.5 + (value - mean) / (deviation * 4), 0, 1, 0.5) : 0
  );

  const vector: number[] = [];
  for (let cellY = 0; cellY < safeSize; cellY += 1) {
    for (let cellX = 0; cellX < safeSize; cellX += 1) {
      const index = cellY * safeSize + cellX;
      if (!opaqueCells[index]) {
        vector.push(0, 0);
        continue;
      }
      const left = normalizedLuma[cellY * safeSize + Math.max(0, cellX - 1)];
      const right = normalizedLuma[cellY * safeSize + Math.min(safeSize - 1, cellX + 1)];
      const top = normalizedLuma[Math.max(0, cellY - 1) * safeSize + cellX];
      const bottom = normalizedLuma[Math.min(safeSize - 1, cellY + 1) * safeSize + cellX];
      const edge = clampNumber((Math.abs(right - left) + Math.abs(bottom - top)) * 1.5, 0, 1, 0);
      vector.push(normalizedLuma[index], edge);
    }
  }

  return {
    size: safeSize,
    vector,
    alphaCoverage: opaqueCellCount / (safeSize * safeSize)
  };
}

export function compareAvatarSignatures(left: AvatarSignature, right: AvatarSignature): number {
  if (left.size !== right.size || left.vector.length !== right.vector.length || left.vector.length === 0) {
    return 0;
  }

  let distance = 0;
  for (let index = 0; index < left.vector.length; index += 1) {
    distance += Math.abs(left.vector[index] - right.vector[index]);
  }

  const averageDistance = distance / left.vector.length;
  const alphaPenalty = Math.abs(left.alphaCoverage - right.alphaCoverage) * 0.18;
  return roundScore(clampNumber(1 - averageDistance - alphaPenalty, 0, 1, 0));
}

export function findBestAvatarMatch(
  candidate: AvatarSignature,
  references: AvatarReference[],
  options: AvatarMatchOptions = {}
): AvatarMatchResult {
  const minScore = options.minScore ?? 0.82;
  const minMargin = options.minMargin ?? 0.045;
  const ranked = references
    .map((reference) => ({
      reference,
      score: compareAvatarSignatures(candidate, reference.signature)
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const runnerUpScore = ranked[1]?.score ?? 0;
  if (!best) {
    return { matched: false, score: 0, runnerUpScore: 0, confidence: 0 };
  }

  const margin = best.score - runnerUpScore;
  const matched = best.score >= minScore && margin >= minMargin;
  return {
    matched,
    assetId: matched ? best.reference.assetId : undefined,
    name: matched ? best.reference.name : undefined,
    score: best.score,
    runnerUpScore,
    confidence: roundScore(clampNumber((best.score - minScore) / 0.12, 0, 1, 0) * 0.65 + clampNumber(margin / minMargin, 0, 1, 0) * 0.35)
  };
}

export function assessAvatarRankConfidence(
  candidates: AvatarRankCandidate[],
  options: AvatarRankConfidenceOptions = {}
): AvatarRankConfidenceResult {
  const minScore = options.minScore ?? 0.9;
  const minMargin = options.minMargin ?? 0.015;
  const ranked = candidates
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];

  if (!best) {
    return { matched: false, score: 0, runnerUpScore: 0, margin: 0, confidence: 0, reason: "empty" };
  }

  const runnerUpScore = ranked[1]?.score ?? 0;
  const margin = best.score - runnerUpScore;
  const score = roundScore(best.score);
  const roundedRunnerUpScore = roundScore(runnerUpScore);
  const roundedMargin = roundScore(margin);

  if (best.score < minScore) {
    return {
      matched: false,
      score,
      runnerUpScore: roundedRunnerUpScore,
      margin: roundedMargin,
      confidence: 0,
      reason: "low-score"
    };
  }

  if (margin < minMargin) {
    return {
      matched: false,
      score,
      runnerUpScore: roundedRunnerUpScore,
      margin: roundedMargin,
      confidence: 0,
      reason: "ambiguous"
    };
  }

  const scoreConfidence = clampNumber((best.score - minScore) / 0.08, 0, 1, 0);
  const marginConfidence = clampNumber(margin / minMargin, 0, 1, 0);

  return {
    matched: true,
    assetId: best.assetId,
    name: best.name,
    score,
    runnerUpScore: roundedRunnerUpScore,
    margin: roundedMargin,
    confidence: roundScore(scoreConfidence * 0.45 + marginConfidence * 0.55),
    reason: "matched"
  };
}

export function resolveStableAvatarDecision(
  frameCandidates: AvatarRankCandidate[][],
  options: AvatarStableDecisionOptions = {}
): AvatarStableDecisionResult {
  const maxFrames = clampInteger(options.maxFrames, 1, 12, 5);
  const minStableFrames = clampInteger(options.minStableFrames, 1, maxFrames, 3);
  const recentFrames = frameCandidates.slice(-maxFrames);
  const frameDecisions = recentFrames.map((candidates) => assessAvatarRankConfidence(candidates, options));
  const latest = frameDecisions.at(-1);

  if (!latest) {
    return {
      matched: false,
      score: 0,
      runnerUpScore: 0,
      margin: 0,
      confidence: 0,
      reason: "empty",
      stableFrameCount: 0,
      consideredFrameCount: 0
    };
  }

  const matchedDecisions = frameDecisions.filter(
    (decision): decision is AvatarRankConfidenceResult & { assetId: string } =>
      decision.matched && Boolean(decision.assetId)
  );

  if (!latest.matched || !latest.assetId) {
    return {
      matched: false,
      score: latest.score,
      runnerUpScore: latest.runnerUpScore,
      margin: latest.margin,
      confidence: 0,
      reason: latest.reason,
      stableFrameCount: 0,
      consideredFrameCount: recentFrames.length
    };
  }

  const stableMatches = matchedDecisions.filter((decision) => decision.assetId === latest.assetId);
  if (stableMatches.length < minStableFrames) {
    return {
      matched: false,
      score: latest.score,
      runnerUpScore: latest.runnerUpScore,
      margin: latest.margin,
      confidence: 0,
      reason: "unstable",
      stableFrameCount: stableMatches.length,
      consideredFrameCount: recentFrames.length
    };
  }

  const averageConfidence =
    stableMatches.reduce((total, decision) => total + decision.confidence, 0) / stableMatches.length;

  return {
    matched: true,
    assetId: latest.assetId,
    name: latest.name,
    score: latest.score,
    runnerUpScore: latest.runnerUpScore,
    margin: latest.margin,
    confidence: roundScore(Math.min(latest.confidence, averageConfidence)),
    reason: "stable",
    stableFrameCount: stableMatches.length,
    consideredFrameCount: recentFrames.length
  };
}

export function getAvatarAssistReadiness(
  slot: AvatarAssistSlotInput,
  candidateAssets: PetAsset[] = []
): AvatarAssistReadiness {
  const asset = slot.asset;
  if (!asset) {
    return {
      status: slot.name?.trim() ? "missing" : "empty",
      title: slot.name?.trim() ? "未匹配" : "空槽",
      detail: slot.name?.trim() ? "先匹配精灵素材" : "未填写精灵",
      canAutoApply: false
    };
  }

  if (!asset.avatarPath) {
    return {
      status: "missing",
      title: "缺头像",
      detail: isVariantLikeAsset(asset) ? "缺少当前形态小头像" : "缺少官方小头像",
      canAutoApply: false
    };
  }

  const sameBaseCandidates = candidateAssets.filter(
    (candidate) =>
      candidate.id !== asset.id &&
      Boolean(candidate.avatarPath) &&
      getAvatarBaseKey(candidate) === getAvatarBaseKey(asset)
  );
  if (sameBaseCandidates.length > 0) {
    return {
      status: "review",
      title: "需确认",
      detail: "同链多形态，需连续帧确认",
      canAutoApply: false
    };
  }

  if (isVariantLikeAsset(asset)) {
    return {
      status: "review",
      title: "需确认",
      detail: "异色/形态头像需人工确认",
      canAutoApply: false
    };
  }

  return {
    status: "ready",
    title: "高置信",
    detail: "可参与自动识别",
    canAutoApply: true
  };
}

export function linkAvatarSourcesToAssets(avatars: AvatarSourceRecord[], assets: PetAsset[]): AvatarAssetLink[] {
  const index = buildAssetNameIndex(assets);
  return avatars.map((avatar) => {
    const exactAsset = index.exact.get(normalizeAvatarName(avatar.name));
    const baseAsset = index.base.get(normalizeAvatarBaseName(avatar.name));
    const asset = exactAsset ?? baseAsset;
    const matchType = exactAsset ? "exact" : baseAsset ? "base" : undefined;
    return {
      ...avatar,
      matchedAssetId: asset?.id,
      matchedAssetName: asset?.name,
      matchedImagePath: asset?.imagePath,
      matchType,
      autoAssignable: matchType === "exact"
    };
  });
}

export function avatarNameFromFile(fileName: string): string {
  return fileName
    .replace(/^精灵_头像_/, "")
    .replace(/\.png$/i, "")
    .replace(/_/g, " ")
    .trim();
}

export function normalizeAvatarName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s_\-·・:：,，。"'“”‘’()（）]/g, "")
    .toLowerCase();
}

function buildAssetNameIndex(assets: PetAsset[]) {
  const exact = new Map<string, PetAsset>();
  const base = new Map<string, PetAsset>();
  for (const asset of assets) {
    const names = [
      asset.name,
      asset.baseName,
      asset.formLabel ? `${asset.baseName ?? asset.name}${asset.formLabel}` : undefined,
      ...(asset.aliases ?? [])
    ].filter(Boolean);
    for (const name of names) {
      const exactName = normalizeAvatarName(name);
      if (exactName && !exact.has(exactName)) {
        exact.set(exactName, asset);
      }
      const baseName = normalizeAvatarBaseName(name);
      if (baseName && !base.has(baseName)) {
        base.set(baseName, asset);
      }
    }
  }
  return { exact, base };
}

function stripAvatarVariant(name: unknown): string {
  return String(name ?? "").replace(/[（(].*?[）)]/g, "").trim();
}

function normalizeAvatarBaseName(value: unknown): string {
  return normalizeAvatarName(stripAvatarVariant(value));
}

function getAvatarBaseKey(asset: PetAsset): string {
  return normalizeAvatarBaseName(asset.baseName || asset.name);
}

function isVariantLikeAsset(asset: PetAsset): boolean {
  return /异色|炫彩|首领|形态|样子|皮肤|信使/.test(
    [asset.name, asset.formLabel, asset.sourceNote, ...(asset.aliases ?? [])].filter(Boolean).join(" ")
  );
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
