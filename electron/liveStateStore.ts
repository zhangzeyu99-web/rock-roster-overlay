import fs from "node:fs/promises";
import path from "node:path";
import type { LiveRosterState, SlotHealth, TeamSide } from "../src/types";
import { getSlotKey, normalizeLiveRosterState, normalizeSlotHealth } from "../src/core/health";
import type { StorePaths } from "./dataStore";

const liveStateCache = new Map<string, LiveRosterState>();
const persistTimers = new Map<string, NodeJS.Timeout>();

export async function readLiveState(paths: StorePaths, projectId = "default"): Promise<LiveRosterState> {
  const cached = liveStateCache.get(projectId);
  if (cached) {
    return cached;
  }

  const filePath = getLiveStateFilePath(paths, projectId);
  try {
    const body = await fs.readFile(filePath, "utf8");
    const state = normalizeLiveRosterState(projectId, JSON.parse(body));
    liveStateCache.set(projectId, state);
    return state;
  } catch {
    const state = normalizeLiveRosterState(projectId, undefined);
    liveStateCache.set(projectId, state);
    return state;
  }
}

export async function writeSlotHealth(
  paths: StorePaths,
  projectId: string,
  side: TeamSide,
  index: number,
  health: Partial<SlotHealth>
): Promise<LiveRosterState> {
  const current = await readLiveState(paths, projectId);
  const key = getSlotKey(side, index);
  const currentHealth = normalizeSlotHealth(current.health[key]);
  const next: LiveRosterState = {
    ...current,
    health: {
      ...current.health,
      [key]: {
        ...normalizeSlotHealth({ ...currentHealth, ...health }),
        updatedAt: new Date().toISOString()
      }
    },
    updatedAt: new Date().toISOString()
  };
  liveStateCache.set(projectId, next);
  schedulePersist(paths, next);
  return next;
}

export async function resetLiveHealth(paths: StorePaths, projectId: string): Promise<LiveRosterState> {
  const current = await readLiveState(paths, projectId);
  const next: LiveRosterState = {
    ...current,
    health: {},
    updatedAt: new Date().toISOString()
  };
  liveStateCache.set(projectId, next);
  schedulePersist(paths, next);
  return next;
}

export async function flushLiveState(paths: StorePaths, projectId?: string): Promise<void> {
  const ids = projectId ? [projectId] : [...liveStateCache.keys()];
  await Promise.all(
    ids.map(async (id) => {
      const timer = persistTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        persistTimers.delete(id);
      }
      const state = liveStateCache.get(id);
      if (state) {
        await persist(paths, state);
      }
    })
  );
}

function schedulePersist(paths: StorePaths, state: LiveRosterState): void {
  const current = persistTimers.get(state.projectId);
  if (current) {
    clearTimeout(current);
  }
  const timer = setTimeout(() => {
    persistTimers.delete(state.projectId);
    void persist(paths, state);
  }, 500);
  timer.unref?.();
  persistTimers.set(state.projectId, timer);
}

async function persist(paths: StorePaths, state: LiveRosterState): Promise<void> {
  const filePath = getLiveStateFilePath(paths, state.projectId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function getLiveStateFilePath(paths: StorePaths, projectId: string): string {
  const safeProjectId = projectId.replace(/[^a-z0-9_-]+/gi, "_") || "default";
  return path.join(paths.dataDir, "data", `live-state-${safeProjectId}.json`);
}
