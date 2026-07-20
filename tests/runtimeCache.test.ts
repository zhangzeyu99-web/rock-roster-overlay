import { describe, expect, it } from "vitest";
import {
  createRuntimeCacheStatus,
  defaultRuntimeCachePolicy,
  evaluateRuntimeCacheLevel,
  megabytesFromElectronMemoryValue,
  shouldAutoCleanupRuntimeCache
} from "../src/core/runtimeCache";

describe("runtime cache policy", () => {
  it("normalizes Electron memory values from KiB and byte-like inputs", () => {
    expect(megabytesFromElectronMemoryValue(512 * 1024)).toBe(512);
    expect(megabytesFromElectronMemoryValue(512 * 1024 * 1024)).toBe(512);
    expect(megabytesFromElectronMemoryValue(undefined)).toBe(0);
  });

  it("classifies normal, warning, and critical memory pressure", () => {
    expect(
      evaluateRuntimeCacheLevel({
        totalPrivateMb: defaultRuntimeCachePolicy.warningPrivateMb - 1,
        totalWorkingSetMb: 500,
        processCount: 2,
        rendererCount: 1,
        largestProcessMb: 300
      })
    ).toBe("normal");

    expect(
      evaluateRuntimeCacheLevel({
        totalPrivateMb: defaultRuntimeCachePolicy.warningPrivateMb,
        totalWorkingSetMb: 500,
        processCount: 2,
        rendererCount: 1,
        largestProcessMb: 300
      })
    ).toBe("warning");

    expect(
      evaluateRuntimeCacheLevel({
        totalPrivateMb: defaultRuntimeCachePolicy.criticalPrivateMb,
        totalWorkingSetMb: 500,
        processCount: 2,
        rendererCount: 1,
        largestProcessMb: 300
      })
    ).toBe("critical");

    expect(
      evaluateRuntimeCacheLevel({
        totalPrivateMb: 200,
        totalWorkingSetMb: defaultRuntimeCachePolicy.criticalWorkingSetMb,
        processCount: 2,
        rendererCount: 1,
        largestProcessMb: 300
      })
    ).toBe("critical");
  });

  it("auto-cleans only at critical pressure and respects cleanup cooldown", () => {
    const now = Date.parse("2026-06-30T05:00:00.000Z");
    const critical = createRuntimeCacheStatus(
      {
        totalPrivateMb: defaultRuntimeCachePolicy.criticalPrivateMb,
        totalWorkingSetMb: 500,
        processCount: 2,
        rendererCount: 1,
        largestProcessMb: 300
      },
      undefined,
      defaultRuntimeCachePolicy,
      new Date(now)
    );

    expect(shouldAutoCleanupRuntimeCache(critical, defaultRuntimeCachePolicy, now)).toBe(true);
    expect(
      shouldAutoCleanupRuntimeCache(
        {
          ...critical,
          lastCleanupAt: new Date(now - 10_000).toISOString()
        },
        defaultRuntimeCachePolicy,
        now
      )
    ).toBe(false);
    expect(
      shouldAutoCleanupRuntimeCache(
        {
          ...critical,
          lastCleanupAt: new Date(now - defaultRuntimeCachePolicy.minCleanupIntervalMs - 1).toISOString()
        },
        defaultRuntimeCachePolicy,
        now
      )
    ).toBe(true);
  });
});
