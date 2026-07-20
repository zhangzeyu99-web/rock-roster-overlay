import type {
  AppState,
  CaptureMode,
  ImportResult,
  LiveRosterState,
  ProjectPresetTransferResult,
  ResolvedRosterProject,
  RuntimeCacheStatus,
  RosterProject,
  SlotHealth,
  TeamSide
} from "../types";

export function getApiBase(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("server") || window.__ROSTER_SERVER_URL__ || window.location.origin;
}

export async function fetchResolvedProject(projectId = "default"): Promise<ResolvedRosterProject> {
  const response = await fetch(`${getApiBase()}/api/state/${projectId}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`状态读取失败：${response.status}`);
  }
  return response.json();
}

export async function getDesktopState(): Promise<AppState> {
  if (!window.roster) {
    throw new Error("桌面接口不可用");
  }
  return window.roster.getState();
}

export async function saveDesktopProject(project: RosterProject): Promise<RosterProject> {
  if (!window.roster) {
    const response = await fetch(`${getApiBase()}/api/project/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project)
    });
    if (!response.ok) {
      throw new Error(`保存失败：${response.status}`);
    }
    return response.json();
  }
  return window.roster.saveProject(project);
}

export async function activateDesktopProject(projectId: string): Promise<RosterProject> {
  if (!window.roster) {
    const response = await fetch(`${getApiBase()}/api/project/${projectId}/activate`, {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`切换失败：${response.status}`);
    }
    return response.json();
  }
  return window.roster.activateProject(projectId);
}

export async function importAssets(): Promise<ImportResult | undefined> {
  if (!window.roster) {
    throw new Error("素材导入需要桌面 GUI");
  }
  return window.roster.importAssets();
}

export async function importBackground(): Promise<string | undefined> {
  if (!window.roster) {
    throw new Error("背景导入需要桌面 GUI");
  }
  return window.roster.importBackground();
}

export async function importHudImage(): Promise<string | undefined> {
  if (!window.roster?.importHudImage) {
    throw new Error("HUD 图片导入需要桌面 GUI");
  }
  return window.roster.importHudImage();
}

export async function exportHudImage(imagePath: string, suggestedName?: string): Promise<string | undefined> {
  if (!window.roster?.exportHudImage) {
    throw new Error("HUD 图片导出需要桌面 GUI");
  }
  return window.roster.exportHudImage(imagePath, suggestedName);
}

export async function exportPng(mode: CaptureMode): Promise<string> {
  if (!window.roster) {
    const response = await fetch(`${getApiBase()}/api/export/default?mode=${mode}`, {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`导出失败：${response.status}`);
    }
    const data = (await response.json()) as { filePath: string };
    return data.filePath;
  }
  return window.roster.exportPng(mode);
}

export async function exportProjectPreset(
  project: RosterProject
): Promise<ProjectPresetTransferResult | undefined> {
  if (!window.roster) {
    throw new Error("项目预设导出需要桌面 GUI");
  }
  return window.roster.exportProjectPreset(project);
}

export async function importProjectPreset(): Promise<ProjectPresetTransferResult | undefined> {
  if (!window.roster) {
    throw new Error("项目预设导入需要桌面 GUI");
  }
  return window.roster.importProjectPreset();
}

export async function updateSlotHealth(
  side: TeamSide,
  index: number,
  health: Partial<SlotHealth>,
  projectId = "default"
): Promise<LiveRosterState> {
  if (!window.roster) {
    const response = await fetch(`${getApiBase()}/api/live-state/${projectId}/health`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side, index, health })
    });
    if (!response.ok) {
      throw new Error(`血量更新失败：${response.status}`);
    }
    return response.json();
  }
  return window.roster.updateSlotHealth(side, index, health, projectId);
}

export async function resetHealth(projectId = "default"): Promise<LiveRosterState> {
  if (!window.roster) {
    const response = await fetch(`${getApiBase()}/api/live-state/${projectId}/reset`, {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`血量重置失败：${response.status}`);
    }
    return response.json();
  }
  return window.roster.resetHealth(projectId);
}

export async function getRuntimeCacheStatus(): Promise<RuntimeCacheStatus | undefined> {
  if (!window.roster?.getRuntimeCacheStatus) {
    return undefined;
  }
  return window.roster.getRuntimeCacheStatus();
}

export async function clearRuntimeCache(): Promise<RuntimeCacheStatus | undefined> {
  if (!window.roster?.clearRuntimeCache) {
    return undefined;
  }
  return window.roster.clearRuntimeCache();
}
