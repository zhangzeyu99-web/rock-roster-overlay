import { contextBridge, ipcRenderer } from "electron";
import type {
  AppState,
  CaptureMode,
  ImportResult,
  LiveRosterState,
  ProjectPresetTransferResult,
  RuntimeCacheStatus,
  RosterProject,
  SlotHealth,
  TeamSide
} from "../src/types";

export interface RosterBridge {
  getState: () => Promise<AppState>;
  saveProject: (project: RosterProject) => Promise<RosterProject>;
  activateProject: (projectId: string) => Promise<RosterProject>;
  importAssets: () => Promise<ImportResult | undefined>;
  importBackground: () => Promise<string | undefined>;
  importHudImage: () => Promise<string | undefined>;
  exportHudImage: (imagePath: string, suggestedName?: string) => Promise<string | undefined>;
  exportPng: (mode: CaptureMode) => Promise<string>;
  exportProjectPreset: (project: RosterProject) => Promise<ProjectPresetTransferResult | undefined>;
  importProjectPreset: () => Promise<ProjectPresetTransferResult | undefined>;
  updateSlotHealth: (
    side: TeamSide,
    index: number,
    health: Partial<SlotHealth>,
    projectId?: string
  ) => Promise<LiveRosterState>;
  resetHealth: (projectId?: string) => Promise<LiveRosterState>;
  openObsWindow: (mode: CaptureMode) => Promise<void>;
  closeObsWindow: () => Promise<void>;
  openControlWindow: () => Promise<void>;
  setControlWindowAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
  focusMainWindow: () => Promise<void>;
  minimizeControlWindow: () => Promise<void>;
  closeControlWindow: () => Promise<void>;
  getRuntimeCacheStatus: () => Promise<RuntimeCacheStatus | undefined>;
  clearRuntimeCache: () => Promise<RuntimeCacheStatus | undefined>;
  revealPath: (filePath: string) => Promise<void>;
  onStateChanged: (callback: () => void) => () => void;
  onRuntimeCacheChanged: (callback: (status: RuntimeCacheStatus) => void) => () => void;
}

const bridge: RosterBridge = {
  getState: () => ipcRenderer.invoke("state:get"),
  saveProject: (project) => ipcRenderer.invoke("project:save", project),
  activateProject: (projectId) => ipcRenderer.invoke("project:activate", projectId),
  importAssets: () => ipcRenderer.invoke("assets:import"),
  importBackground: () => ipcRenderer.invoke("background:import"),
  importHudImage: () => ipcRenderer.invoke("hud-image:import"),
  exportHudImage: (imagePath, suggestedName) => ipcRenderer.invoke("hud-image:export", { imagePath, suggestedName }),
  exportPng: (mode) => ipcRenderer.invoke("png:export", mode),
  exportProjectPreset: (project) => ipcRenderer.invoke("project-preset:export", project),
  importProjectPreset: () => ipcRenderer.invoke("project-preset:import"),
  updateSlotHealth: (side, index, health, projectId) =>
    ipcRenderer.invoke("live-state:update-health", { side, index, health, projectId }),
  resetHealth: (projectId) => ipcRenderer.invoke("live-state:reset-health", projectId),
  openObsWindow: (mode) => ipcRenderer.invoke("obs-window:open", mode),
  closeObsWindow: () => ipcRenderer.invoke("obs-window:close"),
  openControlWindow: () => ipcRenderer.invoke("control-window:open"),
  setControlWindowAlwaysOnTop: (alwaysOnTop) =>
    ipcRenderer.invoke("control-window:set-always-on-top", alwaysOnTop),
  focusMainWindow: () => ipcRenderer.invoke("control-window:focus-main"),
  minimizeControlWindow: () => ipcRenderer.invoke("control-window:minimize"),
  closeControlWindow: () => ipcRenderer.invoke("control-window:close"),
  getRuntimeCacheStatus: () => ipcRenderer.invoke("runtime-cache:get"),
  clearRuntimeCache: () => ipcRenderer.invoke("runtime-cache:clear"),
  revealPath: (filePath) => ipcRenderer.invoke("path:reveal", filePath),
  onStateChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("state-changed", listener);
    return () => ipcRenderer.removeListener("state-changed", listener);
  },
  onRuntimeCacheChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: RuntimeCacheStatus) => callback(status);
    ipcRenderer.on("runtime-cache-changed", listener);
    return () => ipcRenderer.removeListener("runtime-cache-changed", listener);
  }
};

contextBridge.exposeInMainWorld("roster", bridge);
