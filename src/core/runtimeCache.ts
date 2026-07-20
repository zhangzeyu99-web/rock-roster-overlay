import type { RuntimeCacheLevel, RuntimeCachePolicy, RuntimeCacheSample, RuntimeCacheStatus } from "../types";

export const defaultRuntimeCachePolicy: RuntimeCachePolicy = {
  warningPrivateMb: 700,
  criticalPrivateMb: 950,
  criticalWorkingSetMb: 1400,
  minCleanupIntervalMs: 5 * 60 * 1000,
  monitorIntervalMs: 30 * 1000
};

export function megabytesFromElectronMemoryValue(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 0;
  }

  // Electron process metrics are KiB in current builds. Some Chromium surfaces
  // expose byte-like values, so normalize unusually large numbers defensively.
  const kilobytes = value > 16 * 1024 * 1024 ? value / 1024 : value;
  return Math.max(0, Math.round(kilobytes / 1024));
}

export function evaluateRuntimeCacheLevel(
  sample: RuntimeCacheSample,
  policy: RuntimeCachePolicy = defaultRuntimeCachePolicy
): RuntimeCacheLevel {
  if (
    sample.totalPrivateMb >= policy.criticalPrivateMb ||
    sample.totalWorkingSetMb >= policy.criticalWorkingSetMb
  ) {
    return "critical";
  }
  if (sample.totalPrivateMb >= policy.warningPrivateMb) {
    return "warning";
  }
  return "normal";
}

export function createRuntimeCacheStatus(
  sample: RuntimeCacheSample,
  previous?: Pick<
    RuntimeCacheStatus,
    "cleanupCount" | "lastCleanupAt" | "lastCleanupReason" | "lastError" | "cleanupInProgress"
  >,
  policy: RuntimeCachePolicy = defaultRuntimeCachePolicy,
  now = new Date()
): RuntimeCacheStatus {
  return {
    ...sample,
    warningPrivateMb: policy.warningPrivateMb,
    criticalPrivateMb: policy.criticalPrivateMb,
    criticalWorkingSetMb: policy.criticalWorkingSetMb,
    level: previous?.cleanupInProgress ? "cleaning" : evaluateRuntimeCacheLevel(sample, policy),
    cleanupInProgress: previous?.cleanupInProgress ?? false,
    cleanupCount: previous?.cleanupCount ?? 0,
    lastCleanupAt: previous?.lastCleanupAt,
    lastCleanupReason: previous?.lastCleanupReason,
    lastError: previous?.lastError,
    updatedAt: now.toISOString()
  };
}

export function shouldAutoCleanupRuntimeCache(
  status: RuntimeCacheStatus,
  policy: RuntimeCachePolicy = defaultRuntimeCachePolicy,
  nowMs = Date.now()
): boolean {
  if (status.cleanupInProgress || status.level !== "critical") {
    return false;
  }
  if (!status.lastCleanupAt) {
    return true;
  }
  const lastCleanupMs = Date.parse(status.lastCleanupAt);
  return !Number.isFinite(lastCleanupMs) || nowMs - lastCleanupMs >= policy.minCleanupIntervalMs;
}
