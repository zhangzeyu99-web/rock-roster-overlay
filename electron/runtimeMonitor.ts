import { app, session } from "electron";
import type { RuntimeCachePolicy, RuntimeCacheSample, RuntimeCacheStatus } from "../src/types";
import {
  createRuntimeCacheStatus,
  defaultRuntimeCachePolicy,
  megabytesFromElectronMemoryValue,
  shouldAutoCleanupRuntimeCache
} from "../src/core/runtimeCache";

type RuntimeCacheListener = (status: RuntimeCacheStatus) => void;

const emptySample: RuntimeCacheSample = {
  totalPrivateMb: 0,
  totalWorkingSetMb: 0,
  processCount: 0,
  rendererCount: 0,
  largestProcessMb: 0
};

export class RuntimeCacheMonitor {
  private status = createRuntimeCacheStatus(emptySample);
  private timer: NodeJS.Timeout | undefined;
  private cleanupInProgress = false;

  constructor(
    private readonly onStatusChanged: RuntimeCacheListener,
    private readonly policy: RuntimeCachePolicy = defaultRuntimeCachePolicy,
    private readonly releaseRendererMemory?: () => void | Promise<void>
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    void this.sampleAndMaybeClean();
    this.timer = setInterval(() => {
      void this.sampleAndMaybeClean();
    }, this.policy.monitorIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  getStatus(): RuntimeCacheStatus {
    return this.status;
  }

  async clearNow(reason = "manual"): Promise<RuntimeCacheStatus> {
    if (this.cleanupInProgress) {
      return this.status;
    }

    this.cleanupInProgress = true;
    this.status = {
      ...this.status,
      level: "cleaning",
      cleanupInProgress: true,
      lastError: undefined,
      updatedAt: new Date().toISOString()
    };
    this.emit();

    try {
      await this.releaseRendererMemory?.();
      await clearElectronRuntimeCaches();
      const sample = await collectRuntimeCacheSample();
      this.status = createRuntimeCacheStatus(
        sample,
        {
          cleanupCount: this.status.cleanupCount + 1,
          lastCleanupAt: new Date().toISOString(),
          lastCleanupReason: reason,
          cleanupInProgress: false
        },
        this.policy
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "runtime cache cleanup failed";
      this.status = {
        ...this.status,
        level: "critical",
        cleanupInProgress: false,
        lastError: message,
        updatedAt: new Date().toISOString()
      };
    } finally {
      this.cleanupInProgress = false;
      this.emit();
    }

    return this.status;
  }

  private async sampleAndMaybeClean(): Promise<void> {
    if (this.cleanupInProgress) {
      return;
    }
    const sample = await collectRuntimeCacheSample();
    this.status = createRuntimeCacheStatus(sample, this.status, this.policy);
    this.emit();
    if (shouldAutoCleanupRuntimeCache(this.status, this.policy)) {
      await this.clearNow("auto-threshold");
    }
  }

  private emit(): void {
    this.onStatusChanged(this.status);
  }
}

export async function collectRuntimeCacheSample(): Promise<RuntimeCacheSample> {
  const metrics = app.getAppMetrics();
  if (metrics.length === 0) {
    const current = await process.getProcessMemoryInfo();
    const privateMb = megabytesFromElectronMemoryValue(current.private);
    const workingSetMb = megabytesFromElectronMemoryValue(current.residentSet);
    return {
      totalPrivateMb: privateMb,
      totalWorkingSetMb: workingSetMb,
      processCount: 1,
      rendererCount: 0,
      largestProcessMb: privateMb
    };
  }

  let totalPrivateMb = 0;
  let totalWorkingSetMb = 0;
  let largestProcessMb = 0;
  let rendererCount = 0;

  for (const metric of metrics) {
    const privateMb = megabytesFromElectronMemoryValue(metric.memory.privateBytes ?? metric.memory.workingSetSize);
    const workingSetMb = megabytesFromElectronMemoryValue(metric.memory.workingSetSize);
    totalPrivateMb += privateMb;
    totalWorkingSetMb += workingSetMb;
    largestProcessMb = Math.max(largestProcessMb, privateMb);
    if (metric.type === "Tab") {
      rendererCount += 1;
    }
  }

  return {
    totalPrivateMb,
    totalWorkingSetMb,
    processCount: metrics.length,
    rendererCount,
    largestProcessMb
  };
}

async function clearElectronRuntimeCaches(): Promise<void> {
  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData({
    storages: ["cachestorage", "shadercache", "serviceworkers"]
  });
}
