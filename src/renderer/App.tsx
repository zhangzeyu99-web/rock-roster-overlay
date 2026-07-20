import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, DragEvent, ReactNode, UIEvent } from "react";
import {
  Copy,
  Download,
  GripVertical,
  FolderOpen,
  ImagePlus,
  LayoutTemplate,
  MonitorPlay,
  PanelRightOpen,
  Plus,
  Trash2,
  Type,
  Upload
} from "lucide-react";
import type {
  AppState,
  CaptureMode,
  DefeatFilterStyle,
  HealthBarStyle,
  NameLabelStyle,
  PetAsset,
  Resolution,
  ResolvedRosterProject,
  ResolvedRosterSlot,
  RoomDesign,
  RoomPlayerBarPreset,
  RoomTextBox,
  RoomTitleImageStyle,
  RuntimeCacheStatus,
  RosterProject,
  SlotHealth,
  TeamLayoutMode,
  TeamSide
} from "../types";
import {
  assetLibraryInitialLimit,
  filterAssetLibraryItems,
  getAssetLibraryItems,
  getAssetLibraryMatchCount,
  getNextAssetLibraryLimit,
  isShinyAsset
} from "../core/assetLibrary";
import { worldElements } from "../core/elements";
import { fontOptions, getFontOptionByFamily } from "../core/fonts";
import { formatPetFormOptionLabel } from "../core/forms";
import {
  defaultNameLabelStyle,
  getNameLabelPresetStyle,
  nameLabelPresets,
  normalizeNameLabelStyle
} from "../core/nameLabel";
import { applyRosterSlotForm, createDefaultRosterProject, resolveRosterProject, updateRosterSlotName } from "../core/project";
import { normalizeHealthBarStyle } from "../core/health";
import { createProjectFromTemplate, upsertProjectInCollection } from "../core/projectPresets";
import {
  applyQuickImportToProject,
  resolveQuickImportEntries,
  type QuickImportEntry
} from "../core/quickImport";
import { getAvatarAssistReadiness } from "../core/avatarMatching";
import {
  builtinRoomBackground,
  createCompetitionRoomDesign,
  createDefaultRoomHud,
  createCustomRoomTextBox,
  getDefaultRoomTitleTextStyle,
  getRoomTextStylePresetsForRole,
  normalizeRoomDesign,
  roomTitleImageElementId
} from "../core/room";
import {
  formatResolution,
  getCaptureCanvasSize,
  getResolutionPresetId,
  getResolutionPresetStyleDefaults,
  outputResolutionPresets
} from "../core/captureGeometry";
import { getPetSuggestions } from "../core/suggestions";
import {
  activateDesktopProject,
  clearRuntimeCache,
  exportHudImage,
  exportProjectPreset as exportDesktopProjectPreset,
  exportPng,
  getDesktopState,
  getRuntimeCacheStatus,
  importAssets,
  importBackground,
  importHudImage,
  importProjectPreset as importDesktopProjectPreset,
  resetHealth as resetHealthApi,
  saveDesktopProject,
  updateSlotHealth as updateSlotHealthApi
} from "./api";
import { OverlayCanvas } from "./components/OverlayCanvas";
import { OutputViewport } from "./components/OutputViewport";
import { RoomCanvas } from "./components/RoomCanvas";

const sides: TeamSide[] = ["left", "right"];
const elements = worldElements;
type ObsMode = CaptureMode;
type ActivePanel = "roster" | "room" | "live" | "assets";
const deferredProjectPublishDelayMs = 900;
const deferredRoomPublishDelayMs = 420;

const obsModes: Array<{ mode: ObsMode; label: string; hint: string; windowLabel: string }> = [
  {
    mode: "left",
    label: "左队",
    hint: "只采集左侧 6 只阵容。",
    windowLabel: "打开左队窗口"
  },
  {
    mode: "right",
    label: "右队",
    hint: "只采集右侧 6 只阵容。",
    windowLabel: "打开右队窗口"
  },
  {
    mode: "overlay",
    label: "双方",
    hint: "采集左右两队阵容，中心保持透明。",
    windowLabel: "打开双方窗口"
  },
  {
    mode: "room",
    label: "直播间",
    hint: "采集背景、文字装饰和两队阵容。",
    windowLabel: "打开直播间窗口"
  }
];

const previewModes: Array<{ mode: CaptureMode; label: string }> = [
  { mode: "left", label: "左队" },
  { mode: "right", label: "右队" },
  { mode: "overlay", label: "双方" },
  { mode: "room", label: "直播间" }
];

const roomAvatarChoiceLimit = 18;

function getObsUrl(serverUrl: string, mode: ObsMode): string {
  return `${serverUrl}/overlay/default?mode=${mode}`;
}

function formatRuntimeCacheLabel(status: RuntimeCacheStatus | undefined): string {
  if (!status) {
    return "占用 --";
  }
  if (status.level === "cleaning" || status.cleanupInProgress) {
    return "清理中";
  }
  const label = status.level === "critical" ? "过高" : status.level === "warning" ? "偏高" : "正常";
  return `${label} ${status.totalPrivateMb}MB`;
}

function formatRuntimeCacheTitle(status: RuntimeCacheStatus | undefined): string {
  if (!status) {
    return "等待运行时缓存监控数据";
  }
  const parts = [
    `私有内存 ${status.totalPrivateMb}MB`,
    `工作集 ${status.totalWorkingSetMb}MB`,
    `进程 ${status.processCount}`,
    `渲染进程 ${status.rendererCount}`,
    `阈值 ${status.criticalPrivateMb}MB`
  ];
  if (status.lastCleanupAt) {
    parts.push(`上次清理 ${new Date(status.lastCleanupAt).toLocaleTimeString()}`);
  }
  if (status.lastError) {
    parts.push(`错误 ${status.lastError}`);
  }
  return parts.join("，");
}

function isSameRoom(left: RoomDesign | undefined, right: RoomDesign | undefined): boolean {
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(normalizeRoomDesign(left)) === JSON.stringify(normalizeRoomDesign(right));
}

type ExportFeedback = {
  status: "idle" | "running" | "success" | "error";
  mode?: CaptureMode;
  path?: string;
  message?: string;
};

type ProjectTransferFeedback = {
  text: string;
  tone: "info" | "ok" | "warn";
  path?: string;
};

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function getExportDirectory(state: AppState): string {
  if (state.exportDir) {
    return state.exportDir;
  }
  const separator = state.dataDir.includes("\\") ? "\\" : "/";
  return `${state.dataDir.replace(/[\\/]+$/, "")}${separator}exports`;
}

function getCaptureModeLabel(mode: CaptureMode): string {
  if (mode === "room") {
    return "直播间";
  }
  if (mode === "left") {
    return "左队";
  }
  if (mode === "right") {
    return "右队";
  }
  return "双方透明";
}

function getPreviewModeDescription(mode: CaptureMode): string {
  if (mode === "room") {
    return "直播间同步预览";
  }
  if (mode === "overlay") {
    return "双方阵容同步预览";
  }
  return `${getCaptureModeLabel(mode)}阵容同步预览`;
}

function clampResolutionDimension(value: string, fallback: number, min: number, max: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function clampRangeValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function getRoomTextStrokeWidth(style: Partial<RoomTextBox>): number {
  return style.strokeEnabled === false ? 0 : style.strokeWidth ?? 0;
}

function getRoomTextStrokeColor(style: Partial<RoomTextBox>): string {
  return getRoomTextStrokeWidth(style) > 0 ? style.strokeColor ?? "transparent" : "transparent";
}

function normalizePlayerBarPresetSelection(value: string): RoomPlayerBarPreset {
  if (
    value === "s3-storybook" ||
    value === "s3-prism-bookmark" ||
    value === "s3-clover-hinge" ||
    value === "compact" ||
    value === "player-score" ||
    value === "classic"
  ) {
    return value;
  }
  return "s3-clover-hinge";
}

interface RangeInputProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}

function RangeInput({ min, max, step, value, onChange, className, disabled }: RangeInputProps) {
  const [draftValue, setDraftValue] = useState(() => clampRangeValue(value, min, max));
  const isEditingRef = useRef(false);
  const pendingValueRef = useRef<number | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const safeValue = clampRangeValue(draftValue, min, max);
  const range = max - min;
  const progress = range > 0 ? ((safeValue - min) / range) * 100 : 0;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraftValue(clampRangeValue(value, min, max));
    }
  }, [max, min, value]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const flushPendingValue = useCallback(() => {
    if (frameRef.current !== undefined) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    const nextValue = pendingValueRef.current;
    if (nextValue !== undefined) {
      pendingValueRef.current = undefined;
      onChangeRef.current(nextValue);
    }
  }, []);

  const scheduleChange = (nextValue: number) => {
    pendingValueRef.current = nextValue;
    if (frameRef.current !== undefined) {
      return;
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined;
      const pendingValue = pendingValueRef.current;
      if (pendingValue !== undefined) {
        pendingValueRef.current = undefined;
        onChangeRef.current(pendingValue);
      }
    });
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = clampRangeValue(Number(event.currentTarget.value), min, max);
    setDraftValue(nextValue);
    scheduleChange(nextValue);
  };

  const startEditing = () => {
    isEditingRef.current = true;
  };

  const finishEditing = () => {
    isEditingRef.current = false;
    flushPendingValue();
  };

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={safeValue}
      className={["range-input", className ?? ""].join(" ").trim()}
      style={{ "--range-progress": `${progress}%` } as CSSProperties}
      disabled={disabled}
      onFocus={startEditing}
      onPointerDown={startEditing}
      onChange={handleChange}
      onKeyUp={flushPendingValue}
      onPointerUp={finishEditing}
      onPointerCancel={finishEditing}
      onBlur={finishEditing}
    />
  );
}

export function App() {
  const [state, setState] = useState<AppState | undefined>();
  const [status, setStatus] = useState("启动中");
  const [lastExport, setLastExport] = useState<string | undefined>();
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback>({ status: "idle" });
  const [projectTransferFeedback, setProjectTransferFeedback] = useState<ProjectTransferFeedback | undefined>();
  const [importMessage, setImportMessage] = useState<string | undefined>();
  const [previewMode, setPreviewMode] = useState<CaptureMode>("room");
  const [resolutionPanelOpen, setResolutionPanelOpen] = useState(false);
  const [openingObsWindowMode, setOpeningObsWindowMode] = useState<ObsMode | undefined>();
  const [activePanel, setActivePanel] = useState<ActivePanel>("roster");
  const [selectedRoomTextId, setSelectedRoomTextId] = useState<string | undefined>("room-title");
  const [liveSync, setLiveSync] = useState(true);
  const [quickImportText, setQuickImportText] = useState("");
  const [runtimeCacheStatus, setRuntimeCacheStatus] = useState<RuntimeCacheStatus | undefined>();
  const [cacheCleanupRunning, setCacheCleanupRunning] = useState(false);
  const [draftProject, setDraftProject] = useState<RosterProject | undefined>();
  const [roomDraft, setRoomDraft] = useState<RoomDesign | undefined>();
  const stateRef = useRef<AppState | undefined>(undefined);
  const liveSyncRef = useRef(true);
  const draftProjectRef = useRef<RosterProject | undefined>(undefined);
  const roomDraftRef = useRef<RoomDesign | undefined>(undefined);
  const openingObsWindowRef = useRef<ObsMode | undefined>(undefined);
  const roomSaveTimerRef = useRef<number | undefined>(undefined);
  const projectSaveTimerRef = useRef<number | undefined>(undefined);
  const roomSaveSequenceRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    liveSyncRef.current = liveSync;
  }, [liveSync]);

  useEffect(() => {
    draftProjectRef.current = draftProject;
  }, [draftProject]);

  const load = useCallback(async () => {
    const next = await getDesktopState();
    window.__ROSTER_SERVER_URL__ = next.serverUrl;
    setState(next);
    setStatus("已保存");
  }, []);

  useEffect(() => {
    void load().catch((error) => setStatus(error instanceof Error ? error.message : "启动失败"));
    return window.roster?.onStateChanged(() => void load());
  }, [load]);

  useEffect(() => {
    void getRuntimeCacheStatus()
      .then((next) => {
        if (next) {
          setRuntimeCacheStatus(next);
        }
      })
      .catch(() => undefined);
    const unsubscribe = window.roster?.onRuntimeCacheChanged?.((next) => setRuntimeCacheStatus(next));
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    return () => {
      if (roomSaveTimerRef.current) {
        window.clearTimeout(roomSaveTimerRef.current);
      }
      if (projectSaveTimerRef.current) {
        window.clearTimeout(projectSaveTimerRef.current);
      }
    };
  }, []);

  const editableProject = draftProject ?? state?.project;
  const hasDraftProject = Boolean(draftProject || roomDraft);

  const resolved = useMemo(() => {
    if (!state) {
      return undefined;
    }
    return resolveRosterProject(editableProject ?? state.project, state.assets, state.liveState);
  }, [editableProject, state]);
  const showShinyAssets = editableProject?.assetLibrary?.showShiny ?? state?.project.assetLibrary?.showShiny ?? false;
  const selectableAssets = useMemo(
    () => filterAssetLibraryItems(state?.assets ?? [], { showShiny: showShinyAssets }),
    [showShinyAssets, state?.assets]
  );

  const setProjectDraft = useCallback((project: RosterProject) => {
    draftProjectRef.current = project;
    setDraftProject(project);
  }, []);

  const clearProjectDraft = useCallback(() => {
    draftProjectRef.current = undefined;
    setDraftProject(undefined);
  }, []);

  const getEditableProject = useCallback(() => {
    return draftProjectRef.current ?? stateRef.current?.project;
  }, []);

  const getPublishProject = useCallback(() => {
    const project = getEditableProject();
    if (!project) {
      return undefined;
    }
    const pendingRoom = roomDraftRef.current;
    return pendingRoom ? { ...project, room: normalizeRoomDesign(pendingRoom) } : project;
  }, [getEditableProject]);

  const publishProject = useCallback(
    async (project: RosterProject) => {
      if (projectSaveTimerRef.current) {
        window.clearTimeout(projectSaveTimerRef.current);
        projectSaveTimerRef.current = undefined;
      }
      const current = stateRef.current;
      if (!current) {
        return;
      }
      setProjectDraft(project);
      setStatus("同步中");
      try {
        const saved = await saveDesktopProject(project);
        const currentProjects = current.projects?.length ? current.projects : [current.project];
        const collection = upsertProjectInCollection(
          {
            activeProjectId: current.activeProjectId ?? current.project.id,
            projects: currentProjects
          },
          saved
        );
        const nextState = {
          ...current,
          project: saved,
          projects: collection.projects,
          activeProjectId: collection.activeProjectId
        };
        stateRef.current = nextState;
        setState((currentState) => (currentState ? { ...currentState, ...nextState } : currentState));
        clearProjectDraft();
        setRoomDraft((draft) => (isSameRoom(draft, saved.room) ? undefined : draft));
        if (isSameRoom(roomDraftRef.current, saved.room)) {
          roomDraftRef.current = undefined;
        }
        setStatus("已同步");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "同步失败");
      }
    },
    [clearProjectDraft, setProjectDraft]
  );

  const scheduleProjectPublish = (project: RosterProject) => {
    if (projectSaveTimerRef.current) {
      window.clearTimeout(projectSaveTimerRef.current);
    }
    projectSaveTimerRef.current = window.setTimeout(() => {
      projectSaveTimerRef.current = undefined;
      void publishProject(project);
    }, deferredProjectPublishDelayMs);
  };

  const updateProject = async (project: RosterProject, options: { deferred?: boolean } = {}) => {
    if (!stateRef.current) {
      return;
    }
    setProjectDraft(project);
    if (!liveSyncRef.current) {
      if (projectSaveTimerRef.current) {
        window.clearTimeout(projectSaveTimerRef.current);
        projectSaveTimerRef.current = undefined;
      }
      setStatus("未同步");
      return;
    }
    if (options.deferred) {
      setStatus("编辑中");
      scheduleProjectPublish(project);
      return;
    }
    await publishProject(project);
  };

  const updateSlot = (side: TeamSide, index: number, name: string) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    const project = structuredClone(currentProject);
    project.teams[side].slots[index] = updateRosterSlotName(project.teams[side].slots[index], name);
    void updateProject(project);
  };

  const updateSlotAsset = (side: TeamSide, index: number, asset: PetAsset) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    if (!(currentProject.assetLibrary?.showShiny ?? false) && isShinyAsset(asset)) {
      return;
    }
    const project = structuredClone(currentProject);
    project.teams[side].slots[index] = applyRosterSlotForm(project.teams[side].slots[index], asset);
    void updateProject(project);
  };

  const updateSlotForm = (side: TeamSide, index: number, formAssetId: string) => {
    const currentProject = getEditableProject();
    if (!currentProject || !state) {
      return;
    }
    const asset = state.assets.find((item) => item.id === formAssetId);
    if (asset && !(currentProject.assetLibrary?.showShiny ?? false) && isShinyAsset(asset)) {
      return;
    }
    const project = structuredClone(currentProject);
    project.teams[side].slots[index] = asset
      ? applyRosterSlotForm(project.teams[side].slots[index], asset)
      : { ...project.teams[side].slots[index], formAssetId: undefined };
    void updateProject(project);
  };

  const updateSlotDefeated = (side: TeamSide, index: number, defeated: boolean) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    const project = structuredClone(currentProject);
    project.teams[side].slots[index].defeated = defeated;
    void updateProject(project);
  };

  const updateSlotElement = (side: TeamSide, index: number, element: string) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    const project = structuredClone(currentProject);
    project.teams[side].slots[index].element = element || undefined;
    void updateProject(project);
  };

  const applyLiveState = (liveState: NonNullable<AppState["liveState"]>) => {
    setState((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, liveState };
      stateRef.current = next;
      return next;
    });
  };

  const updateSlotHealth = async (side: TeamSide, index: number, health: Partial<SlotHealth>) => {
    const current = stateRef.current;
    if (!current) {
      return;
    }
    try {
      const liveState = await updateSlotHealthApi(side, index, health, current.activeProjectId ?? current.project.id);
      applyLiveState(liveState);
      setStatus("血量已更新");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "血量更新失败");
    }
  };

  const resetLiveHealth = async () => {
    const current = stateRef.current;
    if (!current) {
      return;
    }
    try {
      const liveState = await resetHealthApi(current.activeProjectId ?? current.project.id);
      applyLiveState(liveState);
      setStatus("血量已重置");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "血量重置失败");
    }
  };

  const updateStyle = (patch: Partial<RosterProject["style"]>) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    void updateProject({
      ...currentProject,
      style: { ...currentProject.style, ...patch }
    }, { deferred: true });
  };

  const updateDefeatFilter = (patch: Partial<DefeatFilterStyle>) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    updateStyle({
      defeatFilter: {
        ...(currentProject.style.defeatFilter ?? { grayscale: 1, opacity: 0.55 }),
        ...patch
      }
    });
  };

  const updateResolution = (patch: Partial<Resolution>) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    const currentResolution = currentProject.style.resolution ?? { width: 1920, height: 1080 };
    updateStyle({
      resolution: {
        ...currentResolution,
        ...patch
      }
    });
  };

  const applyResolutionPreset = (resolution: Resolution) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    const defaults = getResolutionPresetStyleDefaults(resolution);
    void updateProject(
      {
        ...currentProject,
        style: {
          ...currentProject.style,
          resolution,
          cardGap: defaults.cardGap,
          imageScale: defaults.imageScale,
          teamLayout: {
            ...defaults.teamLayout,
            mode: currentProject.style.teamLayout?.mode ?? defaults.teamLayout.mode
          }
        },
        room:
          currentProject.room?.mode === "free"
            ? currentProject.room
            : createCompetitionRoomDesign(currentProject.room)
      },
      { deferred: true }
    );
  };

  const updateAssetLibrarySettings = (patch: Partial<NonNullable<RosterProject["assetLibrary"]>>) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    void updateProject(
      {
        ...currentProject,
        assetLibrary: {
          showShiny: currentProject.assetLibrary?.showShiny ?? false,
          ...patch
        }
      },
      { deferred: true }
    );
  };

  const updateNameLabelStyle = (patch: Partial<NameLabelStyle>) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    updateStyle({
      nameLabel: {
        ...normalizeNameLabelStyle(currentProject.style.nameLabel),
        ...patch
      }
    });
  };

  const applyNameLabelPreset = (presetId: string) => {
    updateStyle({ nameLabel: getNameLabelPresetStyle(presetId) });
  };

  const applyQuickImport = (side: TeamSide, entries: QuickImportEntry[]) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    void updateProject(applyQuickImportToProject(currentProject, side, entries));
  };

  const publishPendingChanges = () => {
    const project = getPublishProject();
    if (project) {
      void publishProject(project);
    }
  };

  const toggleLiveSync = (enabled: boolean) => {
    liveSyncRef.current = enabled;
    setLiveSync(enabled);
    if (!enabled) {
      const currentProject = getEditableProject();
      if (currentProject) {
        setProjectDraft(currentProject);
      }
      setStatus("实时同步已关闭");
      return;
    }
    publishPendingChanges();
  };

  const restoreDefaultProject = () => {
    roomDraftRef.current = undefined;
    setRoomDraft(undefined);
    setSelectedRoomTextId("room-title");
    void publishProject(createDefaultRosterProject());
  };

  const renameCurrentProject = async (name: string) => {
    const currentProject = getEditableProject();
    if (!currentProject) {
      return;
    }
    await updateProject({
      ...currentProject,
      name: name.trim() || "未命名预设"
    });
  };

  const createProjectPreset = () => {
    const currentProject = getPublishProject();
    const currentState = stateRef.current;
    if (!currentProject || !currentState) {
      return;
    }
    const currentProjects = currentState.projects?.length ? currentState.projects : [currentState.project];
    const next = createProjectFromTemplate(currentProject, `预设 ${currentProjects.length + 1}`);
    clearProjectDraft();
    roomDraftRef.current = undefined;
    setRoomDraft(undefined);
    void publishProject(next);
  };

  const exportCurrentProjectPreset = async () => {
    const project = getPublishProject();
    if (!project) {
      return;
    }
    setProjectTransferFeedback({ text: "预设导出中", tone: "info" });
    try {
      const result = await exportDesktopProjectPreset(project);
      if (!result) {
        setProjectTransferFeedback(undefined);
        return;
      }
      setProjectTransferFeedback({ text: "预设已导出", tone: "ok", path: result.filePath });
    } catch (error) {
      setProjectTransferFeedback({
        text: error instanceof Error ? error.message : "预设导出失败",
        tone: "warn"
      });
    }
  };

  const importProjectPresetFile = async () => {
    if (hasDraftProject && !window.confirm("当前有未同步改动，导入预设会切换到导入内容。继续导入？")) {
      return;
    }
    setProjectTransferFeedback({ text: "预设导入中", tone: "info" });
    try {
      const result = await importDesktopProjectPreset();
      if (!result) {
        setProjectTransferFeedback(undefined);
        return;
      }
      clearProjectDraft();
      roomDraftRef.current = undefined;
      setRoomDraft(undefined);
      await load();
      setProjectTransferFeedback({ text: `已导入：${result.project?.name ?? fileNameFromPath(result.filePath)}`, tone: "ok", path: result.filePath });
    } catch (error) {
      setProjectTransferFeedback({
        text: error instanceof Error ? error.message : "预设导入失败",
        tone: "warn"
      });
    }
  };

  const switchProjectPreset = async (projectId: string) => {
    if (!stateRef.current || projectId === stateRef.current.activeProjectId) {
      return;
    }
    if (hasDraftProject && !window.confirm("当前有未同步改动，切换预设会放弃这些改动。继续切换？")) {
      return;
    }
    setStatus("切换中");
    clearProjectDraft();
    roomDraftRef.current = undefined;
    setRoomDraft(undefined);
    try {
      await activateDesktopProject(projectId);
      await load();
      setStatus("已切换");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "切换失败");
    }
  };

  const persistRoom = useCallback(
    async (room: RoomDesign) => {
      const currentProject = draftProjectRef.current ?? stateRef.current?.project;
      if (!currentProject) {
        return;
      }
      const project = {
        ...currentProject,
        room: normalizeRoomDesign(room)
      };
      roomSaveSequenceRef.current += 1;
      setProjectDraft(project);
      if (!liveSyncRef.current) {
        setStatus("未同步");
        return;
      }
      await publishProject(project);
    },
    [publishProject, setProjectDraft]
  );

  const updateRoom = (room: RoomDesign, options: { immediate?: boolean; transient?: boolean } = {}) => {
    const normalizedRoom = normalizeRoomDesign(room);
    roomDraftRef.current = normalizedRoom;
    setRoomDraft(normalizedRoom);
    if (roomSaveTimerRef.current) {
      window.clearTimeout(roomSaveTimerRef.current);
      roomSaveTimerRef.current = undefined;
    }
    if (options.transient) {
      return;
    }
    if (options.immediate) {
      void persistRoom(normalizedRoom);
      return;
    }
    roomSaveTimerRef.current = window.setTimeout(() => {
      roomSaveTimerRef.current = undefined;
      void persistRoom(normalizedRoom);
    }, deferredRoomPublishDelayMs);
  };

  const getEditableRoom = () => normalizeRoomDesign(roomDraftRef.current ?? roomDraft ?? resolved?.room);

  const updateRoomTextBox = (box: RoomTextBox, options: { immediate?: boolean; transient?: boolean } = {}) => {
    if (!resolved) {
      return;
    }
    const room = getEditableRoom();
    updateRoom(
      {
        ...room,
        textBoxes: room.textBoxes.map((item) => (item.id === box.id ? box : item))
      },
      options
    );
  };

  const updateRoomTitleImage = (
    titleImage: RoomTitleImageStyle,
    options: { immediate?: boolean; transient?: boolean } = {}
  ) => {
    if (!resolved) {
      return;
    }
    const room = getEditableRoom();
    const hud = room.hud ?? createDefaultRoomHud();
    updateRoom(
      {
        ...room,
        hud: {
          ...hud,
          titleImage
        }
      },
      options
    );
  };

  const addRoomTextBox = () => {
    if (!resolved) {
      return;
    }
    const room = getEditableRoom();
    const box = createCustomRoomTextBox(room.textBoxes.length);
    setSelectedRoomTextId(box.id);
    updateRoom(
      {
        ...room,
        textBoxes: [...room.textBoxes, box]
      },
      { immediate: true }
    );
  };

  const deleteSelectedRoomTextBox = (textId = selectedRoomTextId) => {
    if (!resolved || !textId) {
      return;
    }
    if (textId === roomTitleImageElementId) {
      return;
    }
    const room = getEditableRoom();
    if (room.textBoxes.length <= 1) {
      return;
    }
    const textBoxes = room.textBoxes.filter((box) => box.id !== textId);
    setSelectedRoomTextId(textBoxes[0]?.id);
    updateRoom({ ...room, mode: "free", textBoxes }, { immediate: true });
  };

  const applyRoomPreset = (layoutMode: TeamLayoutMode) => {
    const currentProject = getEditableProject();
    if (!resolved || !currentProject) {
      return;
    }
    const room = createCompetitionRoomDesign(getEditableRoom());
    const defaults = getResolutionPresetStyleDefaults(currentProject.style.resolution ?? resolved.style.resolution);
    const project = {
      ...currentProject,
      style: {
        ...currentProject.style,
        cardGap: defaults.cardGap,
        imageScale: defaults.imageScale,
        teamLayout: {
          ...defaults.teamLayout,
          mode: layoutMode
        }
      },
      room
    };
    roomDraftRef.current = room;
    setRoomDraft(room);
    setSelectedRoomTextId("room-title");
    void updateProject(project);
  };

  const handleBackgroundImport = async () => {
    if (!resolved) {
      return;
    }
    try {
      const imagePath = await importBackground();
      if (!imagePath) {
        return;
      }
      const room = getEditableRoom();
      updateRoom(
        {
          ...room,
          background: {
            ...room.background,
            visible: true,
            imagePath
          }
        },
        { immediate: true }
      );
      setStatus("背景已导入");
      setActivePanel("room");
      setPreviewMode("room");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "背景导入失败");
    }
  };

  const handleTitleImageImport = async () => {
    if (!resolved) {
      return;
    }
    try {
      const imagePath = await importHudImage();
      if (!imagePath) {
        return;
      }
      const room = getEditableRoom();
      const hud = room.hud ?? createDefaultRoomHud();
      updateRoom(
        {
          ...room,
          hud: {
            ...hud,
            titleImage: {
              ...hud.titleImage,
              visible: true,
              imagePath
            }
          }
        },
        { immediate: true }
      );
      setStatus("标题图已导入");
      setSelectedRoomTextId(roomTitleImageElementId);
      setActivePanel("room");
      setPreviewMode("room");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "标题图导入失败");
    }
  };

  const handlePlayerAvatarImport = async (side: TeamSide) => {
    if (!resolved) {
      return;
    }
    try {
      const imagePath = await importHudImage();
      if (!imagePath) {
        return;
      }
      const room = getEditableRoom();
      const hud = room.hud ?? createDefaultRoomHud();
      updateRoom(
        {
          ...room,
          hud: {
            ...hud,
            playerBar: {
              ...hud.playerBar,
              [side === "left" ? "leftAvatarPath" : "rightAvatarPath"]: imagePath,
              avatarVisible: true
            }
          }
        },
        { immediate: true }
      );
      setStatus(side === "left" ? "左侧头像已导入" : "右侧头像已导入");
      setActivePanel("room");
      setPreviewMode("room");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "头像图导入失败");
    }
  };

  const handleTitleImageExport = async () => {
    if (!resolved) {
      return;
    }
    try {
      const room = getEditableRoom();
      const hud = room.hud ?? createDefaultRoomHud();
      const filePath = await exportHudImage(hud.titleImage.imagePath || "", "room-title-image");
      if (filePath) {
        setStatus("标题图已导出");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "标题图导出失败");
    }
  };

  const handleImport = async () => {
    try {
      const result = await importAssets();
      if (!result) {
        return;
      }
      setImportMessage(`导入 ${result.imported.length} 个，跳过 ${result.skipped.length} 个`);
      await load();
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败");
    }
  };

  const handleExport = async (mode: CaptureMode) => {
    const label = getCaptureModeLabel(mode);
    setExportFeedback({ status: "running", mode, message: `${label} PNG 导出中...` });
    setStatus("导出中");
    try {
      const filePath = await exportPng(mode);
      const fileName = fileNameFromPath(filePath);
      setLastExport(filePath);
      setExportFeedback({
        status: "success",
        mode,
        path: filePath,
        message: `已导出 ${fileName}`
      });
      setStatus(`导出完成 ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导出失败";
      setExportFeedback({ status: "error", mode, message });
      setStatus(message);
    }
  };

  const copyObsUrl = async (mode: ObsMode) => {
    if (!state) {
      return;
    }
    await navigator.clipboard.writeText(getObsUrl(state.serverUrl, mode));
    setStatus(`${obsModes.find((item) => item.mode === mode)?.label ?? "OBS"} 地址已复制`);
  };

  const handleClearRuntimeCache = async () => {
    setCacheCleanupRunning(true);
    try {
      const next = await clearRuntimeCache();
      if (next) {
        setRuntimeCacheStatus(next);
      }
      setStatus("缓存已清理");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "缓存清理失败");
    } finally {
      setCacheCleanupRunning(false);
    }
  };

  const openObsWindow = async (mode: ObsMode) => {
    if (openingObsWindowRef.current) {
      return;
    }
    openingObsWindowRef.current = mode;
    setOpeningObsWindowMode(mode);
    try {
      await window.roster?.openObsWindow(mode);
      setStatus(`${obsModes.find((item) => item.mode === mode)?.label ?? "OBS"} 透明窗口已打开`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "OBS 透明窗口打开失败");
    } finally {
      openingObsWindowRef.current = undefined;
      setOpeningObsWindowMode(undefined);
    }
  };

  const closeObsWindow = async () => {
    try {
      await window.roster?.closeObsWindow();
      setStatus("OBS 透明窗口已关闭");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "OBS 透明窗口关闭失败");
    }
  };

  const openControlWindow = async () => {
    try {
      await window.roster?.openControlWindow();
      setStatus("直播快捷控制已打开");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "快捷控制打开失败");
    }
  };

  if (!state || !resolved) {
    return <div className="boot-screen">阵容叠加器启动中</div>;
  }

  const project = editableProject ?? state.project;
  const projectList = state.projects?.length ? state.projects : [state.project];
  const activeProjectId = state.activeProjectId ?? state.project.id;
  const obsUrls = {
    left: getObsUrl(state.serverUrl, "left"),
    right: getObsUrl(state.serverUrl, "right"),
    overlay: getObsUrl(state.serverUrl, "overlay"),
    room: getObsUrl(state.serverUrl, "room")
  } satisfies Record<ObsMode, string>;
  const exportDir = getExportDirectory(state);
  const isExporting = exportFeedback.status === "running";
  const nameLabel = normalizeNameLabelStyle(project.style.nameLabel);
  const healthBar = normalizeHealthBarStyle(project.style.healthBar);
  const room = roomDraft ?? normalizeRoomDesign(resolved.room);
  const previewResolved = { ...resolved, room };
  const titleImageVisible = Boolean(room.hud?.titleImage.visible && room.hud.titleImage.imagePath);
  const selectedTitleImage = selectedRoomTextId === roomTitleImageElementId && titleImageVisible;
  const selectedRoomText =
    selectedTitleImage
      ? undefined
      : room.textBoxes.find((box) => box.id === selectedRoomTextId) ?? room.textBoxes[0];
  const activeRoomSelectionId = selectedTitleImage ? roomTitleImageElementId : selectedRoomText?.id;
  const currentCaptureMode: CaptureMode = previewMode;
  const currentObsMode = obsModes.find((item) => item.mode === currentCaptureMode) ?? obsModes[2];
  const outputResolution = resolved.style.resolution;
  const teamLayout = resolved.style.teamLayout ?? getResolutionPresetStyleDefaults(outputResolution).teamLayout;
  const previewSize = getCaptureCanvasSize(previewMode, outputResolution);
  const missingCount = resolved.missingNames.left.length + resolved.missingNames.right.length;
  const resolutionPresetId = getResolutionPresetId(outputResolution);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <MonitorPlay size={20} />
          <strong>阵容叠加器</strong>
          <span>v{__APP_VERSION__}</span>
          <span className="brand-service">
            <span className="server-dot" />
            本地服务
          </span>
        </div>
        <div className="top-actions">
          <div className="top-live-actions">
            <div className="top-obs-url">
              <span>OBS</span>
              <input value={obsUrls[currentCaptureMode]} readOnly />
              <button onClick={() => void copyObsUrl(currentCaptureMode)} title="复制当前 OBS 地址">
                <Copy size={15} />
              </button>
            </div>
            <button
              className="top-action-button obs-window-button"
              onClick={() => void openObsWindow(currentCaptureMode)}
              disabled={Boolean(openingObsWindowMode)}
            >
              {openingObsWindowMode ? "打开中" : "采集窗口"}
            </button>
            <button className="top-action-button" onClick={() => void openControlWindow()} title="打开直播快捷控制悬浮窗">
              <PanelRightOpen size={15} />
              快捷控制
            </button>
          </div>
          <button className="primary-button compact" onClick={() => void handleExport(currentCaptureMode)} disabled={isExporting}>
            导出预览 PNG
          </button>
          {exportFeedback.status !== "idle" && (
            <div className={["top-export-feedback", `top-export-feedback-${exportFeedback.status}`].join(" ")}>
              <span>{exportFeedback.message}</span>
              {exportFeedback.path && (
                <button className="path-button" onClick={() => window.roster?.revealPath(exportFeedback.path!)}>
                  打开位置
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <aside className="left-panel">
        <ProjectPresetPanel
          activeProjectId={activeProjectId}
          project={project}
          projects={projectList}
          onCreate={createProjectPreset}
          onExport={() => void exportCurrentProjectPreset()}
          onImport={() => void importProjectPresetFile()}
          onRename={renameCurrentProject}
          onSwitch={(projectId) => void switchProjectPreset(projectId)}
          transferFeedback={projectTransferFeedback}
        />
        <nav className="app-nav" aria-label="工作区">
          <button
            type="button"
            className={activePanel === "roster" ? "active" : ""}
            onClick={() => setActivePanel("roster")}
          >
            <MonitorPlay size={17} />
            阵容
          </button>
          <button
            type="button"
            className={activePanel === "room" ? "active" : ""}
            onClick={() => {
              setActivePanel("room");
              setPreviewMode("room");
            }}
          >
            <LayoutTemplate size={17} />
            装修
          </button>
          <button
            type="button"
            className={activePanel === "live" ? "active" : ""}
            onClick={() => setActivePanel("live")}
          >
            <Upload size={17} />
            直播
          </button>
        </nav>
        <SystemStatusPanel
          assetCount={state.assets.length}
          runtimeCacheStatus={runtimeCacheStatus}
          cacheCleanupRunning={cacheCleanupRunning}
          onOpenAssets={() => setActivePanel("assets")}
          onClearCache={() => void handleClearRuntimeCache()}
        />
        <div className="folder-links">
          <button className="data-link data-link-strong" onClick={() => window.roster?.revealPath(exportDir)} title={exportDir}>
            <FolderOpen size={15} />
            导出目录
          </button>
          <button className="data-link" onClick={() => window.roster?.revealPath(state.dataDir)} title={state.dataDir}>
            <FolderOpen size={15} />
            数据目录
          </button>
        </div>
      </aside>

      <main className="preview-area">
        <div className="preview-toolbar">
          <div className="preview-title">
            <strong>{getCaptureModeLabel(previewMode)}</strong>
            <span>{getPreviewModeDescription(previewMode)}</span>
            {previewMode === "room" && (
              <em>
                {selectedTitleImage
                  ? "正在编辑 标题图"
                  : selectedRoomText
                    ? `正在编辑 ${selectedRoomText.text || "未命名文本"}`
                    : "点击文本框或标题图编辑，拖拽移动，右下角缩放"}
              </em>
            )}
          </div>
          <div className="preview-control-stack">
            <div className="preview-switch" aria-label="预览模式">
              {previewModes.map((item) => (
                <button
                  type="button"
                  className={previewMode === item.mode ? "active" : ""}
                  onClick={() => {
                    setPreviewMode(item.mode);
                    if (item.mode === "room") {
                      setActivePanel("room");
                    }
                  }}
                  key={item.mode}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="resolution-menu">
              <button
                type="button"
                className="resolution-entry"
                onClick={() => setResolutionPanelOpen((open) => !open)}
                aria-expanded={resolutionPanelOpen}
              >
                <span>输出分辨率</span>
                <strong>{formatResolution(outputResolution)}</strong>
              </button>
              {resolutionPanelOpen && (
                <div className="resolution-popover" aria-label="输出分辨率设置">
                  <div className="resolution-preset-row">
                    {outputResolutionPresets.map((preset) => (
                      <button
                        type="button"
                        className={resolutionPresetId === preset.id ? "active" : ""}
                        onClick={() => applyResolutionPreset(preset.resolution)}
                        key={preset.id}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="resolution-custom-row">
                    <label>
                      <span>宽</span>
                      <input
                        type="number"
                        min={640}
                        max={7680}
                        step={10}
                        value={outputResolution.width}
                        onChange={(event) =>
                          updateResolution({
                            width: clampResolutionDimension(event.currentTarget.value, outputResolution.width, 640, 7680)
                          })
                        }
                        aria-label="输出宽度"
                      />
                    </label>
                    <label>
                      <span>高</span>
                      <input
                        type="number"
                        min={360}
                        max={4320}
                        step={10}
                        value={outputResolution.height}
                        onChange={(event) =>
                          updateResolution({
                            height: clampResolutionDimension(event.currentTarget.value, outputResolution.height, 360, 4320)
                          })
                        }
                        aria-label="输出高度"
                      />
                    </label>
                  </div>
                  <button type="button" className="resolution-done" onClick={() => setResolutionPanelOpen(false)}>
                    完成
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="preview-board">
          <OutputViewport
            className="preview-output"
            width={previewSize.width}
            height={previewSize.height}
            framed
          >
            {previewMode === "room" ? (
              <RoomCanvas
                resolved={previewResolved}
                editable
                selectedTextId={activeRoomSelectionId}
                onSelectText={setSelectedRoomTextId}
                onChangeTextBox={(box) => updateRoomTextBox(box, { transient: true })}
                onCommitTextBox={(box) => updateRoomTextBox(box, { immediate: true })}
                onChangeTitleImage={(titleImage) => updateRoomTitleImage(titleImage, { transient: true })}
                onCommitTitleImage={(titleImage) => updateRoomTitleImage(titleImage, { immediate: true })}
              />
            ) : (
              <OverlayCanvas resolved={resolved} mode={previewMode} />
            )}
          </OutputViewport>
        </div>
        <div className="preview-status">
          <span>{status}</span>
          <span>{obsUrls[previewMode]}</span>
        </div>
      </main>

      <aside className="right-panel">
        {activePanel === "roster" && (
          <>
        <section className="panel-section">
          <div className="section-title">阵容设置</div>
          <SyncControls
            liveSync={liveSync}
            hasDraft={hasDraftProject}
            onToggle={toggleLiveSync}
            onSync={publishPendingChanges}
            onRestore={restoreDefaultProject}
          />
          <QuickImportPanel
            assets={selectableAssets}
            serverUrl={state.serverUrl}
            value={quickImportText}
            onChange={setQuickImportText}
            onApply={applyQuickImport}
          />
          {sides.map((side) => (
            <TeamEditor
              key={side}
              side={side}
              project={project}
              assets={selectableAssets}
              serverUrl={state.serverUrl}
              missingNames={resolved.missingNames[side]}
              resolvedSlots={resolved.teams[side].slots}
              onSlotChange={updateSlot}
              onSlotAssetSelect={updateSlotAsset}
              onFormChange={updateSlotForm}
              onDefeatedChange={updateSlotDefeated}
              onHealthChange={updateSlotHealth}
              showHealthControls={false}
              onElementChange={updateSlotElement}
            />
          ))}
        </section>

        <PanelDetails
          title="阵容显示微调"
          description="间距、底框和战败效果"
          testId="roster-display-tuning"
        >
          <label className="field-row">
            <span>精灵间距</span>
            <RangeInput
              min={0}
              max={72}
              step={2}
              value={project.style.cardGap}
              onChange={(value) => updateStyle({ cardGap: value })}
            />
            <output>{project.style.cardGap}px</output>
          </label>
          <label className="field-row">
            <span>图片缩放</span>
            <RangeInput
              min={0.7}
              max={1.7}
              step={0.05}
              value={project.style.imageScale}
              onChange={(value) => updateStyle({ imageScale: value })}
            />
            <output>{Math.round(project.style.imageScale * 100)}%</output>
          </label>
          <label className="field-row">
            <span>双队中距</span>
            <RangeInput
              min={520}
              max={1720}
              step={20}
              value={resolved.style.teamLayout?.centerGap ?? 1540}
              onChange={(value) =>
                updateStyle({
                  teamLayout: {
                    ...teamLayout,
                    centerGap: value
                  }
                })
              }
            />
            <output>{resolved.style.teamLayout?.centerGap ?? 1540}px</output>
          </label>
          <label className="field-row">
            <span>上下位置</span>
            <RangeInput
              min={-160}
              max={160}
              step={5}
              value={resolved.style.teamLayout?.verticalOffset ?? 0}
              onChange={(value) =>
                updateStyle({
                  teamLayout: {
                    ...teamLayout,
                    verticalOffset: value
                  }
                })
              }
            />
            <output>{resolved.style.teamLayout?.verticalOffset ?? 0}px</output>
          </label>
          <label className="field-row">
            <span>底框</span>
            <select
              value={project.style.cardBackground}
              onChange={(event) =>
                updateStyle({
                  cardBackground: event.currentTarget.value as RosterProject["style"]["cardBackground"]
                })
              }
            >
              <option value="cloud">柔和云朵</option>
              <option value="transparent">纯透明</option>
              <option value="rectangle">矩形背景</option>
            </select>
            <output>
              {project.style.cardBackground === "cloud"
                ? "云朵"
                : project.style.cardBackground === "rectangle"
                  ? "矩形"
                  : "无底板"}
            </output>
          </label>
          <label className="field-row">
            <span>底板大小</span>
            <RangeInput
              min={0.7}
              max={1.6}
              step={0.01}
              value={resolved.style.cardPlateScale ?? 1.15}
              disabled={project.style.cardBackground === "transparent"}
              onChange={(value) => updateStyle({ cardPlateScale: Number(value.toFixed(2)) })}
            />
            <output>{Math.round((resolved.style.cardPlateScale ?? 1.15) * 100)}%</output>
          </label>
          <label className="field-row">
            <span>底板下移</span>
            <RangeInput
              min={-40}
              max={80}
              step={1}
              value={resolved.style.cardPlateYOffset ?? 18}
              disabled={project.style.cardBackground === "transparent"}
              onChange={(value) => updateStyle({ cardPlateYOffset: Math.round(value) })}
            />
            <output>{resolved.style.cardPlateYOffset ?? 18}px</output>
          </label>
          <label className="field-row">
            <span>底板描边</span>
            <RangeInput
              min={0}
              max={5}
              step={0.25}
              value={resolved.style.cardPlateOutlineWidth ?? 1}
              disabled={project.style.cardBackground === "transparent"}
              onChange={(value) => updateStyle({ cardPlateOutlineWidth: Number(value.toFixed(2)) })}
            />
            <output>{(resolved.style.cardPlateOutlineWidth ?? 1).toFixed(1)}px</output>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={project.style.showElementIcon}
              onChange={(event) => updateStyle({ showElementIcon: event.currentTarget.checked })}
            />
            <span>显示属性图标</span>
          </label>
          <label className="field-row">
            <span>战败灰度</span>
            <RangeInput
              min={0}
              max={1}
              step={0.05}
              value={resolved.style.defeatFilter?.grayscale ?? 1}
              onChange={(value) => updateDefeatFilter({ grayscale: value })}
            />
            <output>{Math.round((resolved.style.defeatFilter?.grayscale ?? 1) * 100)}%</output>
          </label>
          <label className="field-row">
            <span>战败透明</span>
            <RangeInput
              min={0.1}
              max={1}
              step={0.05}
              value={resolved.style.defeatFilter?.opacity ?? 0.55}
              onChange={(value) => updateDefeatFilter({ opacity: value })}
            />
            <output>{Math.round((resolved.style.defeatFilter?.opacity ?? 0.55) * 100)}%</output>
          </label>
        </PanelDetails>

          </>
        )}

        {activePanel === "room" && (
          <RoomDesignPanel
            room={room}
            selectedText={selectedRoomText}
            selectedTitleImage={selectedTitleImage}
            assets={state.assets}
            serverUrl={state.serverUrl}
            onRoomChange={updateRoom}
            onTextChange={updateRoomTextBox}
            onSelectText={setSelectedRoomTextId}
            onSelectTitleImage={() => setSelectedRoomTextId(roomTitleImageElementId)}
            onAddText={addRoomTextBox}
            onDeleteText={deleteSelectedRoomTextBox}
            teamLayoutMode={teamLayout.mode ?? "curved"}
            onApplyRoomPreset={applyRoomPreset}
            onImportBackground={() => void handleBackgroundImport()}
            onImportTitleImage={() => void handleTitleImageImport()}
            onExportTitleImage={() => void handleTitleImageExport()}
            onImportPlayerAvatar={(side) => void handlePlayerAvatarImport(side)}
          />
        )}

        {activePanel === "roster" && (
          <>

        <PanelDetails title="名字样式" description="预设、字体和颜色" testId="roster-name-style">
          <div className="preset-grid">
            {nameLabelPresets.map((preset) => {
              const active = nameLabel.presetId === preset.id;
              return (
                <button
                  type="button"
                  className={["preset-card", active ? "preset-card-active" : ""].join(" ")}
                  onClick={() => applyNameLabelPreset(preset.id)}
                  key={preset.id}
                  title={preset.description}
                >
                  <span
                    className="preset-pill"
                    style={
                      {
                        "--preset-text": preset.style.textColor,
                        "--preset-shadow": preset.style.textShadowColor,
                        "--preset-bg-top": preset.style.backgroundTop,
                        "--preset-bg-bottom": preset.style.backgroundBottom,
                        "--preset-border": preset.style.borderColor,
                        "--preset-drop": preset.style.shadowColor
                      } as CSSProperties
                    }
                  >
                    化蝶
                  </span>
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
          <button className="style-reset" onClick={() => updateStyle({ nameLabel: defaultNameLabelStyle })}>
            恢复世界实战
          </button>
          <FontPicker
            label="字体"
            value={nameLabel.fontFamily}
            onChange={(fontFamily) => updateNameLabelStyle({ fontFamily })}
          />
          <label className="field-row">
            <span>字号</span>
            <RangeInput
              min={12}
              max={28}
              value={nameLabel.fontSize}
              onChange={(value) => updateNameLabelStyle({ fontSize: value })}
            />
            <output>{nameLabel.fontSize}px</output>
          </label>
          <label className="field-row">
            <span>字重</span>
            <select
              value={nameLabel.fontWeight}
              onChange={(event) => updateNameLabelStyle({ fontWeight: Number(event.currentTarget.value) })}
            >
              <option value={450}>450</option>
              <option value={600}>600</option>
              <option value={630}>630</option>
              <option value={700}>700</option>
              <option value={800}>800</option>
              <option value={900}>900</option>
            </select>
            <output>{nameLabel.fontWeight}</output>
          </label>
          <div className="color-grid">
            <label className="color-field">
              <span>文字</span>
              <input
                type="color"
                value={nameLabel.textColor}
                onChange={(event) => updateNameLabelStyle({ textColor: event.currentTarget.value })}
              />
            </label>
            <label className="color-field">
              <span>高光</span>
              <input
                type="color"
                value={nameLabel.textShadowColor}
                onChange={(event) => updateNameLabelStyle({ textShadowColor: event.currentTarget.value })}
              />
            </label>
            <label className="color-field">
              <span>框上</span>
              <input
                type="color"
                value={nameLabel.backgroundTop}
                onChange={(event) => updateNameLabelStyle({ backgroundTop: event.currentTarget.value })}
              />
            </label>
            <label className="color-field">
              <span>框下</span>
              <input
                type="color"
                value={nameLabel.backgroundBottom}
                onChange={(event) => updateNameLabelStyle({ backgroundBottom: event.currentTarget.value })}
              />
            </label>
            <label className="color-field">
              <span>描边</span>
              <input
                type="color"
                value={nameLabel.borderColor}
                onChange={(event) => updateNameLabelStyle({ borderColor: event.currentTarget.value })}
              />
            </label>
          </div>
          <label className="field-row">
            <span>描边宽</span>
            <RangeInput
              min={0}
              max={4}
              value={nameLabel.borderWidth}
              onChange={(value) => updateNameLabelStyle({ borderWidth: value })}
            />
            <output>{nameLabel.borderWidth}px</output>
          </label>
          <label className="field-row">
            <span>框高</span>
            <RangeInput
              min={22}
              max={44}
              value={nameLabel.height}
              onChange={(value) => updateNameLabelStyle({ height: value })}
            />
            <output>{nameLabel.height}px</output>
          </label>
          <label className="field-row">
            <span>内边距</span>
            <RangeInput
              min={4}
              max={18}
              value={nameLabel.horizontalPadding}
              onChange={(value) => updateNameLabelStyle({ horizontalPadding: value })}
            />
            <output>{nameLabel.horizontalPadding}px</output>
          </label>
          <label className="field-row">
            <span>最小宽</span>
            <RangeInput
              min={64}
              max={180}
              value={nameLabel.minWidth}
              onChange={(value) => updateNameLabelStyle({ minWidth: value })}
            />
            <output>{nameLabel.minWidth}px</output>
          </label>
          <label className="field-row">
          <span>名称位置</span>
            <RangeInput
              min={-10}
              max={18}
              value={nameLabel.verticalGap}
              onChange={(value) => updateNameLabelStyle({ verticalGap: value })}
            />
            <output>{nameLabel.verticalGap}px</output>
          </label>
        </PanelDetails>

          </>
        )}

        {activePanel === "live" && (
        <section className="panel-section export-section">
          <div className="section-title">导出与直播</div>
          <div className="live-readiness-grid">
            <span className={liveSync ? "ready" : "warn"}>
              同步：{liveSync ? "实时" : "手动"}
            </span>
            <span className={missingCount === 0 ? "ready" : "warn"}>
              素材：{missingCount === 0 ? "完整" : `缺 ${missingCount} 个`}
            </span>
            <span>预览：{getCaptureModeLabel(previewMode)}</span>
          </div>
          <div className="live-subsection">
            <div className="live-subsection-head">
              <strong>当前输出</strong>
              <span>{currentObsMode.hint} 分辨率 {formatResolution(outputResolution)}。</span>
            </div>
            <div className="obs-url-row">
              <input value={obsUrls[currentCaptureMode]} readOnly aria-label="当前 OBS 地址" />
              <button onClick={() => void copyObsUrl(currentCaptureMode)} title="复制当前 OBS 地址">
                <Copy size={16} />
              </button>
            </div>
            <button onClick={() => void openObsWindow(currentCaptureMode)} disabled={Boolean(openingObsWindowMode)}>
              {openingObsWindowMode === currentCaptureMode ? "打开中" : currentObsMode.windowLabel}
            </button>
            <button className="primary-button" onClick={() => void handleExport(currentCaptureMode)}>
              <Upload size={17} />
              导出当前 PNG
            </button>
          </div>
          <PanelDetails title="更多 PNG 导出" description="左右队、双方透明和直播间" testId="live-more-export">
            <button className="primary-button" onClick={() => void handleExport("overlay")}>
              <Upload size={17} />
              导出双方透明 PNG
            </button>
            <div className="two-buttons">
              <button onClick={() => void handleExport("left")}>
                <Download size={16} />
                左队 PNG
              </button>
              <button onClick={() => void handleExport("right")}>
                <Download size={16} />
                右队 PNG
              </button>
            </div>
            <button onClick={() => void handleExport("room")}>
              <LayoutTemplate size={16} />
              导出直播间 PNG
            </button>
          </PanelDetails>
          <PanelDetails title="所有 OBS 地址" description="按采集源复制或打开窗口" testId="live-all-obs">
          <div className="obs-mode-list">
            {obsModes.map((item) => {
              return (
                <div className="obs-mode-card" key={item.mode}>
                  <div className="obs-mode-head">
                    <strong>{item.label}</strong>
                    <span>{item.hint} 尺寸随当前输出自动适配。</span>
                  </div>
                  <div className="obs-url-row">
                    <input value={obsUrls[item.mode]} readOnly />
                    <button onClick={() => void copyObsUrl(item.mode)} title={`复制${item.label}地址`}>
                      <Copy size={16} />
                    </button>
                  </div>
                  <button onClick={() => void openObsWindow(item.mode)} disabled={Boolean(openingObsWindowMode)}>
                    {openingObsWindowMode === item.mode ? "打开中" : item.windowLabel}
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={() => void closeObsWindow()}>关闭透明窗口</button>
          </PanelDetails>
          <PanelDetails
            title="透明窗口设置"
            description="窗口采集尺寸、置顶和鼠标穿透"
            testId="live-window-settings"
            className="live-window-settings"
          >
          <label className="field-row">
            <span>窗口宽</span>
            <RangeInput
              min={240}
              max={1920}
              step={20}
              value={resolved.style.obsWindow?.width ?? 420}
              onChange={(value) =>
                updateStyle({
                  obsWindow: {
                    ...(resolved.style.obsWindow ?? {
                      width: 420,
                      height: 1080,
                      alwaysOnTop: true,
                      clickThrough: true
                    }),
                    width: value
                  }
                })
              }
            />
            <output>{resolved.style.obsWindow?.width ?? 420}</output>
          </label>
          <label className="field-row">
            <span>窗口高</span>
            <RangeInput
              min={360}
              max={2160}
              step={20}
              value={resolved.style.obsWindow?.height ?? 1080}
              onChange={(value) =>
                updateStyle({
                  obsWindow: {
                    ...(resolved.style.obsWindow ?? {
                      width: 420,
                      height: 1080,
                      alwaysOnTop: true,
                      clickThrough: true
                    }),
                    height: value
                  }
                })
              }
            />
            <output>{resolved.style.obsWindow?.height ?? 1080}</output>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={resolved.style.obsWindow?.alwaysOnTop ?? true}
              onChange={(event) =>
                updateStyle({
                  obsWindow: {
                    ...(resolved.style.obsWindow ?? {
                      width: 420,
                      height: 1080,
                      alwaysOnTop: true,
                      clickThrough: true
                    }),
                    alwaysOnTop: event.currentTarget.checked
                  }
                })
              }
            />
            <span>透明窗口置顶</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={resolved.style.obsWindow?.clickThrough ?? true}
              onChange={(event) =>
                updateStyle({
                  obsWindow: {
                    ...(resolved.style.obsWindow ?? {
                      width: 420,
                      height: 1080,
                      alwaysOnTop: true,
                      clickThrough: true
                    }),
                    clickThrough: event.currentTarget.checked
                  }
                })
              }
            />
            <span>窗口不挡鼠标</span>
          </label>
          </PanelDetails>
          {lastExport && (
            <div className="export-result">
              <span>已导出：{lastExport}</span>
              <button className="path-button" onClick={() => window.roster?.revealPath(lastExport)}>
                <FolderOpen size={15} />
                打开导出位置
              </button>
            </div>
          )}
          <MissingSummary missingNames={resolved.missingNames} />
        </section>
        )}

        {activePanel === "assets" && (
          <section className="panel-section asset-inspector">
            <div className="section-title">素材</div>
            <AssetList
              assets={state.assets}
              serverUrl={state.serverUrl}
              showShiny={project.assetLibrary?.showShiny ?? false}
              onShowShinyChange={(showShiny) => updateAssetLibrarySettings({ showShiny })}
            />
            <button className="import-button" onClick={() => void handleImport()}>
              <ImagePlus size={17} />
              导入素材文件夹
            </button>
            {importMessage && <div className="small-note">{importMessage}</div>}
          </section>
        )}
      </aside>
    </div>
  );
}

interface ProjectPresetPanelProps {
  activeProjectId: string;
  project: RosterProject;
  projects: RosterProject[];
  onCreate: () => void;
  onExport: () => void;
  onImport: () => void;
  onRename: (name: string) => void | Promise<void>;
  onSwitch: (projectId: string) => void;
  transferFeedback?: ProjectTransferFeedback;
}

interface PanelDetailsProps {
  title: string;
  description?: string;
  testId?: string;
  className?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function PanelDetails({ title, description, testId, className, defaultOpen = false, children }: PanelDetailsProps) {
  return (
    <details
      className={["panel-details", className ?? ""].join(" ")}
      data-testid={testId}
      open={defaultOpen ? true : undefined}
    >
      <summary className="panel-details-summary">
        <span>
          <strong>{title}</strong>
          {description && <em>{description}</em>}
        </span>
      </summary>
      <div className="panel-details-body">{children}</div>
    </details>
  );
}

interface SystemStatusPanelProps {
  assetCount: number;
  runtimeCacheStatus: RuntimeCacheStatus | undefined;
  cacheCleanupRunning: boolean;
  onOpenAssets: () => void;
  onClearCache: () => void;
}

function SystemStatusPanel({
  assetCount,
  runtimeCacheStatus,
  cacheCleanupRunning,
  onOpenAssets,
  onClearCache
}: SystemStatusPanelProps) {
  return (
    <section className="system-status-panel" aria-label="运行状态">
      <div className="system-status-head">
        <span>运行状态</span>
        <button type="button" onClick={onClearCache} disabled={cacheCleanupRunning} title="清理运行时图片和页面缓存">
          <Trash2 size={13} />
          {cacheCleanupRunning ? "清理中" : "清理"}
        </button>
      </div>
      <button type="button" className="system-status-row" onClick={onOpenAssets} title="打开素材管理">
        <span>素材库</span>
        <strong>{assetCount} 张</strong>
      </button>
      <div
        className={[
          "system-status-row",
          "system-status-cache",
          runtimeCacheStatus ? `system-status-cache-${runtimeCacheStatus.level}` : ""
        ].join(" ")}
        title={formatRuntimeCacheTitle(runtimeCacheStatus)}
      >
        <span>运行占用</span>
        <strong>{formatRuntimeCacheLabel(runtimeCacheStatus)}</strong>
      </div>
    </section>
  );
}

function ProjectPresetPanel({
  activeProjectId,
  project,
  projects,
  onCreate,
  onExport,
  onImport,
  onRename,
  onSwitch,
  transferFeedback
}: ProjectPresetPanelProps) {
  const [name, setName] = useState(project.name);
  const [saveHint, setSaveHint] = useState<{ text: string; tone: "info" | "ok" | "warn" } | undefined>();
  const saveHintTimerRef = useRef<number | undefined>(undefined);
  const trimmedName = name.trim();
  const hasNameChange = trimmedName !== project.name;

  useEffect(() => {
    setName(project.name);
    setSaveHint(undefined);
  }, [project.id, project.name]);

  useEffect(() => {
    return () => {
      if (saveHintTimerRef.current) {
        window.clearTimeout(saveHintTimerRef.current);
      }
    };
  }, []);

  const showSaveHint = (text: string, tone: "info" | "ok" | "warn") => {
    if (saveHintTimerRef.current) {
      window.clearTimeout(saveHintTimerRef.current);
    }
    setSaveHint({ text, tone });
    saveHintTimerRef.current = window.setTimeout(() => {
      setSaveHint(undefined);
      saveHintTimerRef.current = undefined;
    }, 2200);
  };

  const saveName = async () => {
    if (!trimmedName) {
      setName(project.name);
      showSaveHint("名称不能为空", "warn");
      return;
    }
    if (!hasNameChange) {
      showSaveHint("没有改动", "info");
      return;
    }
    showSaveHint("保存中", "info");
    try {
      await onRename(trimmedName);
      showSaveHint("已保存", "ok");
    } catch {
      showSaveHint("保存失败", "warn");
    }
  };

  return (
    <div className="project-lockup">
      <div className="project-lockup-head">
        <span>项目</span>
        <button type="button" onClick={onCreate} title="新建项目预设" aria-label="新建项目预设">
          <Plus size={15} />
        </button>
      </div>
      <label className="project-select-row">
        <span>当前项目</span>
        <select
          className="project-select"
          aria-label="切换项目预设"
          value={activeProjectId}
          onChange={(event) => onSwitch(event.currentTarget.value)}
        >
          {projects.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="project-name-edit">
        <input
          aria-label="项目名称"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="项目名称"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void saveName();
              event.currentTarget.blur();
            }
          }}
        />
        <button type="button" onClick={() => void saveName()}>
          保存
        </button>
      </div>
      <div className="project-transfer-actions">
        <button type="button" onClick={onImport}>
          导入预设
        </button>
        <button type="button" onClick={onExport}>
          导出预设
        </button>
      </div>
      {saveHint && (
        <div className={["project-save-hint", `project-save-hint-${saveHint.tone}`].join(" ")}>
          {saveHint.text}
        </div>
      )}
      {transferFeedback && (
        <div className={["project-save-hint", `project-save-hint-${transferFeedback.tone}`].join(" ")}>
          <span>{transferFeedback.text}</span>
          {transferFeedback.path && (
            <button
              type="button"
              className="project-feedback-path"
              onClick={() => window.roster?.revealPath(transferFeedback.path!)}
            >
              打开位置
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface SyncControlsProps {
  liveSync: boolean;
  hasDraft: boolean;
  onToggle: (enabled: boolean) => void;
  onSync: () => void;
  onRestore: () => void;
}

function SyncControls({ liveSync, hasDraft, onToggle, onSync, onRestore }: SyncControlsProps) {
  return (
    <div className="sync-card">
      <div className="sync-card-head">
        <label className="toggle-row sync-toggle">
          <input
            type="checkbox"
            checked={liveSync}
            onChange={(event) => onToggle(event.currentTarget.checked)}
          />
          <span>实时同步</span>
        </label>
        <span className={["sync-badge", liveSync ? "sync-badge-live" : "sync-badge-paused"].join(" ")}>
          {liveSync ? "OBS 实时更新" : "仅本机预览"}
        </span>
      </div>
      <div className="sync-card-actions sync-card-actions-primary">
        <button
          type="button"
          className="sync-now-button"
          onClick={onSync}
          disabled={!hasDraft}
        >
          同步到 OBS
        </button>
      </div>
      <details className="sync-more-actions">
        <summary>更多操作</summary>
        <button
          type="button"
          className="restore-preset-button"
          onClick={() => {
            if (window.confirm("恢复默认项目会重置当前阵容和装修，继续？")) {
              onRestore();
            }
          }}
        >
          恢复默认
        </button>
      </details>
      <div className={["sync-state", liveSync ? "sync-state-live" : "sync-state-paused"].join(" ")}>
        {liveSync ? "修改后自动保存并刷新 OBS。" : "调整完后点“同步到 OBS”。"}
      </div>
    </div>
  );
}

interface QuickImportPanelProps {
  assets: PetAsset[];
  serverUrl: string;
  value: string;
  onChange: (value: string) => void;
  onApply: (side: TeamSide, entries: QuickImportEntry[]) => void;
}

function QuickImportPanel({ assets, serverUrl, value, onChange, onApply }: QuickImportPanelProps) {
  const entries = useMemo(() => resolveQuickImportEntries(value, assets), [assets, value]);
  const fillEntries = entries.slice(0, 12);
  const matchedCount = entries.filter((entry) => entry.matched).length;
  const overflowCount = Math.max(0, entries.length - 12);
  const fillUnmatched = fillEntries.filter((entry) => !entry.matched).map((entry) => entry.input);
  const unmatched = fillUnmatched;
  const canApply = fillEntries.length > 0 && fillUnmatched.length === 0;
  const secondTeamCount = Math.min(6, Math.max(0, fillEntries.length - 6));

  return (
    <div className="quick-import-card">
      <div className="quick-import-head">
        <strong>快速导入阵容</strong>
        <div className="quick-import-head-actions">
          {value.trim() && (
            <button type="button" onClick={() => onChange("")}>
              清空
            </button>
          )}
          <span className="quick-import-match-summary">
            {entries.length === 0 ? "待输入" : `${matchedCount}/${entries.length}`}
          </span>
        </div>
      </div>
      <textarea
        className="quick-import-textarea"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="精灵名，换行或逗号分隔"
        rows={4}
      />
      {entries.length > 0 && (
        <div className="quick-import-results">
          {entries.map((entry, index) => (
            <div
              className={["quick-import-result", entry.matched ? "quick-import-result-ready" : ""].join(" ")}
              key={`${entry.input}-${index}`}
            >
              <span>{index + 1}</span>
              {entry.asset ? (
                <img src={assetImageSrc(entry.asset, serverUrl)} alt="" loading="lazy" />
              ) : (
                <em>?</em>
              )}
              <strong>
                {entry.asset?.name ?? entry.input}
                {entry.matchType === "fuzzy" ? "（近似）" : ""}
              </strong>
            </div>
          ))}
        </div>
      )}
      {unmatched.length > 0 && <div className="quick-import-warning">未匹配：{unmatched.join("、")}</div>}
      {secondTeamCount > 0 && (
        <div className="quick-import-warning">
          超过 6 个时会顺延到另一队。
        </div>
      )}
      {overflowCount > 0 && <div className="quick-import-warning">多出 {overflowCount} 个，填充时只取前 12 个。</div>}
      <div className="quick-import-actions">
        <button
          type="button"
          className="quick-import-apply-left"
          onClick={() => onApply("left", fillEntries)}
          disabled={!canApply}
        >
          填充左队
        </button>
        <button
          type="button"
          className="quick-import-apply-right"
          onClick={() => onApply("right", fillEntries)}
          disabled={!canApply}
        >
          填充右队
        </button>
      </div>
    </div>
  );
}

interface FontPickerProps {
  label: string;
  value: string;
  onChange: (fontFamily: string) => void;
}

function FontPicker({ label, value, onChange }: FontPickerProps) {
  const selectedOption = getFontOptionByFamily(value);
  const selectedId = selectedOption?.id ?? "custom";

  const handlePresetChange = (optionId: string) => {
    if (optionId === "custom") {
      return;
    }
    const option = fontOptions.find((item) => item.id === optionId);
    if (option) {
      onChange(option.fontFamily);
    }
  };

  return (
    <div className="font-picker">
      <label className="field-row field-row-wide">
        <span>{label}</span>
        <select value={selectedId} onChange={(event) => handlePresetChange(event.currentTarget.value)}>
          {fontOptions.map((option) => (
            <option value={option.id} key={option.id}>
              {option.label}
            </option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </label>
      {selectedId === "custom" && (
        <label className="field-row field-row-wide font-custom-row">
          <span>自定义</span>
          <input
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder="输入系统字体名或 font-family"
          />
        </label>
      )}
    </div>
  );
}

interface RoomDesignPanelProps {
  room: RoomDesign;
  selectedText?: RoomTextBox;
  selectedTitleImage: boolean;
  assets: PetAsset[];
  serverUrl: string;
  onRoomChange: (room: RoomDesign) => void;
  onTextChange: (box: RoomTextBox) => void;
  onSelectText: (id: string) => void;
  onSelectTitleImage: () => void;
  onAddText: () => void;
  onDeleteText: (id?: string) => void;
  teamLayoutMode: TeamLayoutMode;
  onApplyRoomPreset: (mode: TeamLayoutMode) => void;
  onImportBackground: () => void;
  onImportTitleImage: () => void;
  onExportTitleImage: () => void;
  onImportPlayerAvatar: (side: TeamSide) => void;
}

function RoomDesignPanel({
  room,
  selectedText,
  selectedTitleImage,
  assets,
  serverUrl,
  onRoomChange,
  onTextChange,
  onSelectText,
  onSelectTitleImage,
  onAddText,
  onDeleteText,
  teamLayoutMode,
  onApplyRoomPreset,
  onImportBackground,
  onImportTitleImage,
  onExportTitleImage,
  onImportPlayerAvatar
}: RoomDesignPanelProps) {
  const [deletingTextId, setDeletingTextId] = useState<string | undefined>();
  const longPressTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== undefined) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const cancelTextDeletePress = () => {
    if (longPressTimerRef.current !== undefined) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = undefined;
    }
    setDeletingTextId(undefined);
  };

  const startTextDeletePress = (id: string) => {
    cancelTextDeletePress();
    if (room.textBoxes.length <= 1) {
      return;
    }
    setDeletingTextId(id);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = undefined;
      setDeletingTextId(undefined);
      onDeleteText(id);
    }, 700);
  };

  const patchRoom = (patch: Partial<RoomDesign>) => {
    onRoomChange(normalizeRoomDesign({ ...room, ...patch }));
  };
  const patchBackground = (patch: Partial<RoomDesign["background"]>) => {
    patchRoom({ background: { ...room.background, ...patch } });
  };
  const hud = room.hud ?? createDefaultRoomHud();
  const [avatarSearch, setAvatarSearch] = useState("");
  const roomAvatarChoices = useMemo(
    () => getRoomAvatarChoiceAssets(assets, [hud.playerBar.leftAvatarPath, hud.playerBar.rightAvatarPath], avatarSearch),
    [assets, hud.playerBar.leftAvatarPath, hud.playerBar.rightAvatarPath, avatarSearch]
  );
  const titleTextBox = room.textBoxes.find((box) => box.role === "title");
  const selectTitleText = () => {
    if (titleTextBox) {
      onSelectText(titleTextBox.id);
    }
  };
  const withDefaultTitleTextStyle = (nextRoom: RoomDesign): RoomDesign => ({
    ...nextRoom,
    textBoxes: nextRoom.textBoxes.map((box) =>
      box.role === "title" ? { ...box, ...getDefaultRoomTitleTextStyle() } : box
    )
  });
  const patchTitleImage = (patch: Partial<typeof hud.titleImage>) => {
    patchRoom({
      hud: {
        ...hud,
        titleImage: {
          ...hud.titleImage,
          ...patch
        }
      }
    });
  };
  const toggleTitleImageVisible = () => {
    const visible = !hud.titleImage.visible;
    if (visible) {
      patchTitleImage({ visible: true });
      onSelectTitleImage();
      return;
    }
    onRoomChange(
      normalizeRoomDesign(
        withDefaultTitleTextStyle({
          ...room,
          hud: {
            ...hud,
            titleImage: {
              ...hud.titleImage,
              visible: false
            }
          }
        })
      )
    );
    selectTitleText();
  };
  const removeTitleImage = () => {
    onRoomChange(
      normalizeRoomDesign(
        withDefaultTitleTextStyle({
          ...room,
          hud: {
            ...hud,
            titleImage: {
              ...hud.titleImage,
              visible: false,
              imagePath: undefined
            }
          }
        })
      )
    );
    selectTitleText();
  };
  const patchPlayerBar = (patch: Partial<typeof hud.playerBar>) => {
    patchRoom({
      hud: {
        ...hud,
        playerBar: {
          ...hud.playerBar,
          ...patch
        }
      }
    });
  };
  const selectPlayerAvatar = (side: TeamSide, imagePath: string) => {
    patchPlayerBar(
      side === "left"
        ? { leftAvatarPath: imagePath, avatarVisible: true }
        : { rightAvatarPath: imagePath, avatarVisible: true }
    );
  };
  const patchSelectedText = (patch: Partial<RoomTextBox>) => {
    if (!selectedText) {
      return;
    }
    onTextChange({ ...selectedText, ...patch });
  };
  const patchRoleText = (role: RoomTextBox["role"], patch: Partial<RoomTextBox>) => {
    const target = room.textBoxes.find((box) => box.role === role);
    if (!target) {
      return;
    }
    onSelectText(target.id);
    onRoomChange(
      normalizeRoomDesign({
        ...room,
        textBoxes: room.textBoxes.map((box) => (box.id === target.id ? { ...box, ...patch } : box))
      })
    );
  };
  const selectedTextPresets = selectedText ? getRoomTextStylePresetsForRole(selectedText.role) : [];
  const selectedStrokeEnabled = selectedText ? selectedText.strokeEnabled ?? selectedText.strokeWidth > 0 : false;
  const playerBarPresetStatus =
    hud.playerBar.preset === "s3-clover-hinge"
      ? "S3 四叶合页"
      : hud.playerBar.preset === "s3-storybook"
        ? "S3 童话书脊"
        : hud.playerBar.preset === "s3-prism-bookmark"
          ? "S3 棱镜书签"
          : hud.playerBar.preset === "compact"
            ? "低遮挡"
            : hud.playerBar.preset === "player-score"
              ? "跟随选手"
              : "经典";

  return (
    <section className="panel-section room-design-section">
      <div className="section-title">直播间装修</div>
      <div className="room-control-group">
        <div className="room-control-head">
          <strong>模式</strong>
          <span>{teamLayoutMode === "vertical" ? "3.2.5 旧版预设" : "新版直播预设"}</span>
        </div>
        <div className="room-action-row">
          <button
            type="button"
            className={teamLayoutMode === "curved" ? "active" : ""}
            onClick={() => onApplyRoomPreset("curved")}
          >
            <LayoutTemplate size={16} />
            新版预设
          </button>
          <button
            type="button"
            className={teamLayoutMode === "vertical" ? "active" : ""}
            onClick={() => onApplyRoomPreset("vertical")}
          >
            3.2.5 旧版
          </button>
        </div>
      </div>

      <div className="room-control-group">
        <div className="room-control-head">
          <strong>背景</strong>
          <span>{room.background.imagePath === builtinRoomBackground ? "内置背景" : "自定义背景"}</span>
        </div>
        <label className="field-row">
          <span>显示</span>
          <select
            value={room.background.visible ? "show" : "hide"}
            onChange={(event) => patchBackground({ visible: event.currentTarget.value === "show" })}
          >
            <option value="show">显示</option>
            <option value="hide">隐藏</option>
          </select>
          <output>{room.background.visible ? "开启" : "隐藏"}</output>
        </label>
        <div className="two-buttons">
          <button type="button" onClick={onImportBackground}>
            <ImagePlus size={16} />
            导入背景
          </button>
          <button type="button" onClick={() => patchBackground({ imagePath: builtinRoomBackground, visible: true })}>
            内置背景
          </button>
        </div>
        <PanelDetails
          title="背景高级"
          description="填充、透明度、压暗和虚化"
          testId="room-background-advanced"
          className="panel-details-compact"
        >
        <label className="field-row">
          <span>填充</span>
          <select
            value={room.background.fit}
            onChange={(event) => patchBackground({ fit: event.currentTarget.value === "contain" ? "contain" : "cover" })}
          >
            <option value="cover">铺满裁切</option>
            <option value="contain">完整显示</option>
          </select>
          <output>{room.background.fit === "cover" ? "铺满" : "完整"}</output>
        </label>
        <label className="field-row">
          <span>透明度</span>
          <RangeInput
            min={0}
            max={1}
            step={0.05}
            value={room.background.opacity}
            onChange={(value) => patchBackground({ opacity: value })}
          />
          <output>{Math.round(room.background.opacity * 100)}%</output>
        </label>
        <label className="field-row">
          <span>压暗</span>
          <RangeInput
            min={0}
            max={0.8}
            step={0.05}
            value={room.background.dim}
            onChange={(value) => patchBackground({ dim: value })}
          />
          <output>{Math.round(room.background.dim * 100)}%</output>
        </label>
        <label className="field-row">
          <span>四周虚化</span>
          <RangeInput
            min={0}
            max={80}
            step={2}
            value={room.background.edgeBlur}
            onChange={(value) => patchBackground({ edgeBlur: value })}
          />
          <output>{room.background.edgeBlur}px</output>
        </label>
        </PanelDetails>
      </div>

      <div className="room-control-group room-hud-controls">
        <div className="room-control-head">
          <strong>直播 HUD</strong>
          <span>{hud.playerBar.visible ? "底部选手栏开启" : "底部选手栏隐藏"}</span>
        </div>
        <PanelDetails
          title="显示项和动效"
          description="底栏、左右选手、比分和动画开关"
          testId="room-hud-visibility"
          className="panel-details-compact room-hud-visibility"
        >
          <div className="room-hud-toggle-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={hud.playerBar.visible}
                onChange={(event) => patchPlayerBar({ visible: event.currentTarget.checked })}
              />
              <span>显示底部选手栏</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={hud.playerBar.leftVisible}
                onChange={(event) => patchPlayerBar({ leftVisible: event.currentTarget.checked })}
              />
              <span>左侧选手</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={hud.playerBar.rightVisible}
                onChange={(event) => patchPlayerBar({ rightVisible: event.currentTarget.checked })}
              />
              <span>右侧选手</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={hud.playerBar.scoreVisible}
                onChange={(event) => patchPlayerBar({ scoreVisible: event.currentTarget.checked })}
              />
              <span>显示比分</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={hud.playerBar.animation}
                onChange={(event) => patchPlayerBar({ animation: event.currentTarget.checked })}
              />
              <span>开关动画</span>
            </label>
          </div>
        </PanelDetails>
        <label className="field-row">
          <span>计分栏样式</span>
          <select
            value={hud.playerBar.preset}
            onChange={(event) =>
              patchPlayerBar({
                preset: normalizePlayerBarPresetSelection(event.currentTarget.value)
              })
            }
          >
            <option value="s3-clover-hinge">S3 四叶合页（默认）</option>
            <option value="s3-storybook">S3 童话书脊</option>
            <option value="s3-prism-bookmark">S3 棱镜书签</option>
            <option value="classic">经典直播栏</option>
            <option value="compact">低遮挡扁平栏</option>
            <option value="player-score">分数跟随选手</option>
          </select>
          <output>{playerBarPresetStatus}</output>
        </label>
        <PanelDetails
          title="计分栏尺寸"
          description="统一调整宽度、选手名和比分"
          testId="room-player-bar-size"
          className="panel-details-compact room-player-bar-size"
        >
          <label className="field-row">
            <span>整体宽度</span>
            <RangeInput
              min={0.7}
              max={1.2}
              step={0.01}
              value={hud.playerBar.widthScale ?? 1}
              onChange={(value) => patchPlayerBar({ widthScale: value })}
            />
            <output>{Math.round((hud.playerBar.widthScale ?? 1) * 100)}%</output>
          </label>
          <label className="field-row">
            <span>选手与比分</span>
            <RangeInput
              min={0.7}
              max={1.8}
              step={0.01}
              value={hud.playerBar.textScale ?? 1}
              onChange={(value) => patchPlayerBar({ textScale: value })}
            />
            <output>{Math.round((hud.playerBar.textScale ?? 1) * 100)}%</output>
          </label>
          <p className="room-control-hint">VS 与赛制保持独立字号。</p>
        </PanelDetails>
        <label className="field-row">
          <span>赛制</span>
          <input
            value={hud.playerBar.boText}
            onChange={(event) => patchPlayerBar({ boText: event.currentTarget.value })}
          />
          <output>{hud.playerBar.boText || "BO"}</output>
        </label>
        <div className="room-avatar-panel">
          <div className="room-control-subhead">
            <strong>头像位</strong>
            <span>{hud.playerBar.avatarVisible ? "显示双方头像" : "已隐藏"}</span>
          </div>
          <label className="toggle-row room-avatar-hidden-toggle">
            <input
              type="checkbox"
              data-testid="room-avatar-hidden-toggle"
              checked={!hud.playerBar.avatarVisible}
              onChange={(event) => patchPlayerBar({ avatarVisible: !event.currentTarget.checked })}
            />
            <span>隐藏双方头像</span>
          </label>
          <PanelDetails
            title="头像库"
            description="展开后搜索和选择"
            testId="room-avatar-library"
            className="panel-details-compact room-avatar-library"
          >
            <label className="room-avatar-search">
              <span>搜索精灵头像</span>
              <input
                data-testid="room-avatar-search"
                value={avatarSearch}
                onChange={(event) => setAvatarSearch(event.currentTarget.value)}
                placeholder="输入精灵名 / 别名"
              />
            </label>
            <div className="room-avatar-choice-sets">
              {sides.map((side) => {
                const label = side === "left" ? "左侧头像" : "右侧头像";
                const selectedPath = side === "left" ? hud.playerBar.leftAvatarPath : hud.playerBar.rightAvatarPath;
                return (
                  <div className="room-avatar-choice-set" key={side}>
                    <div className="room-avatar-choice-head">
                      <strong>{label}</strong>
                      <span>{roomAvatarChoices.length} 个素材</span>
                    </div>
                    <div className="room-avatar-choice-grid">
                      <button
                        type="button"
                        className="room-avatar-choice room-avatar-choice-import"
                        data-testid={`room-avatar-${side}-import`}
                        aria-label={`导入${label}`}
                        onClick={() => onImportPlayerAvatar(side)}
                      >
                        <ImagePlus size={18} />
                        <span>导入</span>
                      </button>
                      {roomAvatarChoices.map((asset, index) => {
                        const avatarPath = getRoomAvatarHudPath(asset);
                        if (!avatarPath) {
                          return null;
                        }
                        const active = normalizeHudAvatarPath(selectedPath) === normalizeHudAvatarPath(avatarPath);
                        return (
                          <button
                            type="button"
                            className={["room-avatar-choice", active ? "active" : ""].join(" ")}
                            data-testid={`room-avatar-${side}-choice-${index}`}
                            aria-label={`选择${label}${asset.name}`}
                            title={asset.name}
                            onClick={() => selectPlayerAvatar(side, avatarPath)}
                            key={`${side}-${asset.id}`}
                          >
                            <img src={assetAvatarSrc(asset, serverUrl)} alt="" loading="lazy" decoding="async" />
                            <span>{asset.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {roomAvatarChoices.length === 0 && (
                <div className="room-avatar-empty">
                  {avatarSearch.trim() ? "没有匹配的精灵头像，可换关键词或导入素材" : "暂无可选精灵头像，可先导入素材"}
                </div>
              )}
            </div>
          </PanelDetails>
        </div>
        <div className="room-hud-quick-text">
          <label>
            <span>标题</span>
            <input
              value={room.textBoxes.find((box) => box.role === "title")?.text ?? ""}
              onChange={(event) => patchRoleText("title", { text: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>左选手</span>
            <input
              value={room.textBoxes.find((box) => box.role === "player-left")?.text ?? ""}
              onChange={(event) => patchRoleText("player-left", { text: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>右选手</span>
            <input
              value={room.textBoxes.find((box) => box.role === "player-right")?.text ?? ""}
              onChange={(event) => patchRoleText("player-right", { text: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>左比分</span>
            <input
              value={room.textBoxes.find((box) => box.role === "score-left")?.text ?? ""}
              onChange={(event) => patchRoleText("score-left", { text: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>右比分</span>
            <input
              value={room.textBoxes.find((box) => box.role === "score-right")?.text ?? ""}
              onChange={(event) => patchRoleText("score-right", { text: event.currentTarget.value })}
            />
          </label>
        </div>
        <div className="two-buttons room-hud-title-actions">
          <button type="button" onClick={onImportTitleImage}>
            <ImagePlus size={16} />
            导入标题图
          </button>
          <button
            type="button"
            onClick={toggleTitleImageVisible}
            disabled={!hud.titleImage.imagePath}
          >
            {hud.titleImage.visible ? "隐藏标题图" : "显示标题图"}
          </button>
        </div>
        {hud.titleImage.imagePath && hud.titleImage.visible && (
          <>
            <button
              type="button"
              className={["room-title-select-button", selectedTitleImage ? "active" : ""].join(" ")}
              onClick={onSelectTitleImage}
            >
              选中标题图
            </button>
            {selectedTitleImage && (
            <PanelDetails
              title="标题图高级"
              description="导出、移除、裁切和坐标尺寸"
              testId="room-title-image-advanced"
              className="panel-details-compact"
            >
            <div className="two-buttons room-hud-title-actions">
              <button type="button" onClick={onExportTitleImage}>
                <Download size={16} />
                导出标题图
              </button>
              <button type="button" onClick={removeTitleImage}>
                移除标题图
              </button>
            </div>
            <label className="field-row room-hud-fit-row">
              <span>标题图</span>
              <select
                value={hud.titleImage.fit}
                onChange={(event) =>
                  patchTitleImage({ fit: event.currentTarget.value === "cover" ? "cover" : "contain" })
                }
              >
                <option value="contain">完整</option>
                <option value="cover">裁切</option>
              </select>
              <output>{hud.titleImage.visible ? "显示" : "隐藏"}</output>
            </label>
            <div className="room-number-grid">
              <label>
                <span>X</span>
                <input
                  type="number"
                  value={Math.round(hud.titleImage.x)}
                  onChange={(event) => patchTitleImage({ x: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Y</span>
                <input
                  type="number"
                  value={Math.round(hud.titleImage.y)}
                  onChange={(event) => patchTitleImage({ y: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>宽</span>
                <input
                  type="number"
                  value={Math.round(hud.titleImage.width)}
                  onChange={(event) => patchTitleImage({ width: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>高</span>
                <input
                  type="number"
                  value={Math.round(hud.titleImage.height)}
                  onChange={(event) => patchTitleImage({ height: Number(event.currentTarget.value) })}
                />
              </label>
            </div>
            </PanelDetails>
            )}
          </>
        )}
      </div>

      <PanelDetails
        title="辅助线"
        description={room.guides?.visible ? "OBS 对齐参考已显示" : "仅编辑时需要打开"}
        testId="room-guides-settings"
        className="room-control-group"
      >
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={room.guides?.visible ?? false}
            onChange={(event) =>
              patchRoom({
                guides: {
                  ...(room.guides ?? { visible: false, mode: "safe" }),
                  visible: event.currentTarget.checked
                }
              })
            }
          />
          <span>显示直播间辅助线</span>
        </label>
        <label className="field-row">
          <span>类型</span>
          <select
            value={room.guides?.mode ?? "safe"}
            onChange={(event) =>
              patchRoom({
                guides: {
                  ...(room.guides ?? { visible: false, mode: "safe" }),
                  mode: event.currentTarget.value === "center" ? "center" : "safe"
                }
              })
            }
          >
            <option value="safe">居中 + 安全框</option>
            <option value="center">仅居中线</option>
          </select>
          <output>{room.guides?.visible ? "显示" : "隐藏"}</output>
        </label>
      </PanelDetails>

      <div className="room-control-group room-text-list">
        <div className="room-control-head room-control-head-inline">
          <div>
            <strong>文本图层</strong>
            <span>点击选择，右侧按钮删除。</span>
          </div>
          <button type="button" onClick={onAddText}>
            <Plus size={16} />
            新增
          </button>
        </div>
        {room.textBoxes.map((box) => (
          <div className="room-text-list-row" key={box.id}>
            <button
              type="button"
              className={[
                "room-text-list-item",
                selectedText?.id === box.id ? "active" : "",
                deletingTextId === box.id ? "room-text-list-item-deleting" : ""
              ].join(" ")}
              onClick={() => onSelectText(box.id)}
              onPointerDown={() => startTextDeletePress(box.id)}
              onPointerUp={cancelTextDeletePress}
              onPointerCancel={cancelTextDeletePress}
              onPointerLeave={cancelTextDeletePress}
              onContextMenu={(event) => event.preventDefault()}
              title="点击选择文本框"
            >
              <GripVertical size={14} />
              <Type size={15} />
              <span>{box.text || "未命名文本"}</span>
              <em>{getRoomTextRoleLabel(box.role)}</em>
            </button>
            <button
              type="button"
              className="room-text-delete"
              onClick={() => onDeleteText(box.id)}
              disabled={room.textBoxes.length <= 1}
              title="删除文本框"
              aria-label={`删除${box.text || "文本框"}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {selectedText ? (
        <div className="room-control-group room-text-controls">
          <div className="room-control-head">
            <strong>选中文本</strong>
            <span>{getRoomTextRoleLabel(selectedText.role)}</span>
          </div>
          <label className="field-row field-row-wide">
            <span>文字</span>
            <textarea
              value={selectedText.text}
              onChange={(event) => patchSelectedText({ text: event.currentTarget.value })}
            />
          </label>
          <div className="room-number-grid">
            <label>
              <span>X</span>
              <input
                type="number"
                value={Math.round(selectedText.x)}
                onChange={(event) => patchSelectedText({ x: Number(event.currentTarget.value) })}
              />
            </label>
            <label>
              <span>Y</span>
              <input
                type="number"
                value={Math.round(selectedText.y)}
                onChange={(event) => patchSelectedText({ y: Number(event.currentTarget.value) })}
              />
            </label>
            <label>
              <span>宽</span>
              <input
                type="number"
                value={Math.round(selectedText.width)}
                onChange={(event) => patchSelectedText({ width: Number(event.currentTarget.value) })}
              />
            </label>
            <label>
              <span>高</span>
              <input
                type="number"
                value={Math.round(selectedText.height)}
                onChange={(event) => patchSelectedText({ height: Number(event.currentTarget.value) })}
              />
            </label>
          </div>
          <PanelDetails
            title="文字样式高级"
            description="预设、字体、颜色、描边和透明度"
            testId="room-selected-text-style"
            className="panel-details-compact room-text-style-advanced"
            defaultOpen={selectedText.role === "title"}
          >
          {selectedTextPresets.length > 0 && (
            <div className="room-text-style-presets">
              {selectedTextPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  data-fill-style={preset.style.fillStyle ?? "solid"}
                  onClick={() => patchSelectedText(preset.style)}
                  style={
                    {
                      "--room-preset-color": preset.style.color,
                      "--room-preset-stroke": getRoomTextStrokeColor(preset.style),
                      "--room-preset-stroke-width": `${getRoomTextStrokeWidth(preset.style)}px`,
                      "--room-preset-shadow": preset.style.shadowColor,
                      "--room-preset-font": preset.style.fontFamily,
                      "--room-preset-fill-color": preset.style.color
                    } as CSSProperties
                  }
                >
                  <span>{selectedText.role === "title" ? "赛" : "名"}</span>
                  {preset.name}
                </button>
              ))}
            </div>
          )}
          <FontPicker
            label="字体"
            value={selectedText.fontFamily}
            onChange={(fontFamily) => patchSelectedText({ fontFamily })}
          />
          {selectedText.role === "title" && (
            <label className="field-row">
              <span>填充</span>
              <select
                value={selectedText.fillStyle ?? "solid"}
                onChange={(event) => {
                  const fillStyle = event.currentTarget.value === "s3-lead-prism" ? "s3-lead-prism" : "solid";
                  const leadPreset = selectedTextPresets.find((preset) => preset.id === "s3-lead-prism");
                  patchSelectedText(fillStyle === "s3-lead-prism" && leadPreset ? leadPreset.style : { fillStyle });
                }}
              >
                <option value="s3-lead-prism">铅绘幻梦</option>
                <option value="solid">纯色</option>
              </select>
              <output>{selectedText.fillStyle === "s3-lead-prism" ? "纹理" : "纯色"}</output>
            </label>
          )}
          <label className="field-row">
            <span>字号</span>
            <RangeInput
              min={12}
              max={120}
              value={selectedText.fontSize}
              onChange={(value) => patchSelectedText({ fontSize: value })}
            />
            <output>{selectedText.fontSize}px</output>
          </label>
          <label className="field-row">
            <span>字重</span>
            <select
              value={selectedText.fontWeight}
              onChange={(event) => patchSelectedText({ fontWeight: Number(event.currentTarget.value) })}
            >
              <option value={500}>500</option>
              <option value={700}>700</option>
              <option value={800}>800</option>
              <option value={900}>900</option>
            </select>
            <output>{selectedText.fontWeight}</output>
          </label>
          <label className="field-row">
            <span>对齐</span>
            <select
              value={selectedText.align}
              onChange={(event) =>
                patchSelectedText({
                  align:
                    event.currentTarget.value === "left" || event.currentTarget.value === "right"
                      ? event.currentTarget.value
                      : "center"
                })
              }
            >
              <option value="left">左</option>
              <option value="center">中</option>
              <option value="right">右</option>
            </select>
            <output>{selectedText.align}</output>
          </label>
          <div className="color-grid">
            <label className="color-field">
              <span>文字</span>
              <input
                type="color"
                value={toHexColor(selectedText.color, "#ffffff")}
                onChange={(event) => patchSelectedText({ color: event.currentTarget.value })}
              />
            </label>
            <label className="color-field">
              <span>描边</span>
              <input
                type="color"
                value={toHexColor(selectedText.strokeColor, "#ffffff")}
                disabled={!selectedStrokeEnabled}
                onChange={(event) => patchSelectedText({ strokeColor: event.currentTarget.value })}
              />
            </label>
            <label className="color-field">
              <span>阴影</span>
              <input
                type="color"
                value={toHexColor(selectedText.shadowColor, "#12203a")}
                onChange={(event) => patchSelectedText({ shadowColor: event.currentTarget.value })}
              />
            </label>
            <label className="color-field">
              <span>底色</span>
              <input
                type="color"
                value={toHexColor(selectedText.background, "#242932")}
                onChange={(event) =>
                  patchSelectedText({
                    background: event.currentTarget.value,
                    backgroundOpacity: selectedText.backgroundOpacity <= 0 ? 1 : selectedText.backgroundOpacity
                  })
                }
              />
            </label>
            <label className="color-field">
              <span>边框</span>
              <input
                type="color"
                value={toHexColor(selectedText.borderColor, "#ffffff")}
                onChange={(event) =>
                  patchSelectedText({
                    borderColor: event.currentTarget.value,
                    borderWidth: selectedText.borderWidth <= 0 ? 2 : selectedText.borderWidth
                  })
                }
              />
            </label>
          </div>
          <label className="field-row">
            <span>底色透明度</span>
            <RangeInput
              min={0}
              max={100}
              value={Math.round(selectedText.backgroundOpacity * 100)}
              onChange={(value) =>
                patchSelectedText({
                  background:
                    value > 0 && selectedText.background.trim().toLowerCase() === "transparent"
                      ? "#242932"
                      : selectedText.background,
                  backgroundOpacity: value / 100
                })
              }
            />
            <output>{Math.round(selectedText.backgroundOpacity * 100)}%</output>
          </label>
          <label className="field-row">
            <span>圆角</span>
            <RangeInput
              min={0}
              max={60}
              value={selectedText.radius}
              onChange={(value) => patchSelectedText({ radius: value })}
            />
            <output>{selectedText.radius}px</output>
          </label>
          <label className="field-row">
            <span>边框宽</span>
            <RangeInput
              min={0}
              max={8}
              step={0.2}
              value={selectedText.borderWidth}
              onChange={(value) =>
                patchSelectedText({
                  borderColor:
                    value > 0 && selectedText.borderColor.trim().toLowerCase() === "transparent"
                      ? "#ffffff"
                      : selectedText.borderColor,
                  borderWidth: value
                })
              }
            />
            <output>{selectedText.borderWidth}px</output>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={selectedStrokeEnabled}
              onChange={(event) =>
                patchSelectedText({
                  strokeEnabled: event.currentTarget.checked,
                  strokeColor:
                    event.currentTarget.checked && selectedText.strokeColor.trim().toLowerCase() === "transparent"
                      ? "#ffffff"
                      : selectedText.strokeColor,
                  strokeWidth:
                    event.currentTarget.checked && selectedText.strokeWidth <= 0 ? 1.4 : selectedText.strokeWidth
                })
              }
            />
            <span>字体描边</span>
          </label>
          <label className="field-row">
            <span>描边宽</span>
            <RangeInput
              min={0}
              max={6}
              step={0.1}
              value={selectedText.strokeWidth}
              disabled={!selectedStrokeEnabled}
              onChange={(value) => patchSelectedText({ strokeWidth: Number(value.toFixed(1)) })}
            />
            <output>{selectedStrokeEnabled ? `${selectedText.strokeWidth.toFixed(1)}px` : "关闭"}</output>
          </label>
          <label className="field-row">
            <span>文本透明度</span>
            <RangeInput
              min={0.05}
              max={1}
              step={0.05}
              value={selectedText.opacity}
              onChange={(value) => patchSelectedText({ opacity: value })}
            />
            <output>{Math.round(selectedText.opacity * 100)}%</output>
          </label>
          </PanelDetails>
          <button type="button" className="danger-button" onClick={() => onDeleteText()} disabled={room.textBoxes.length <= 1}>
            <Trash2 size={15} />
            删除选中文本框
          </button>
        </div>
      ) : (
        <div className="small-note">在预览里点击一个文本框后编辑。</div>
      )}
    </section>
  );
}

function AssetList({
  assets,
  serverUrl,
  showShiny,
  onShowShinyChange
}: {
  assets: PetAsset[];
  serverUrl: string;
  showShiny: boolean;
  onShowShinyChange: (showShiny: boolean) => void;
}) {
  const assetResultsRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(assetLibraryInitialLimit);
  const [viewportState, setViewportState] = useState({ scrollTop: 0, height: 480 });
  const assetLibraryOptions = useMemo(() => ({ showShiny }), [showShiny]);
  const visible = useMemo(() => {
    return getAssetLibraryItems(assets, query, visibleLimit, assetLibraryOptions);
  }, [assetLibraryOptions, assets, query, visibleLimit]);
  const totalMatches = useMemo(
    () => getAssetLibraryMatchCount(assets, query, assetLibraryOptions),
    [assetLibraryOptions, assets, query]
  );

  useEffect(() => {
    setVisibleLimit(assetLibraryInitialLimit);
    setViewportState((current) => ({ ...current, scrollTop: 0 }));
    if (assetResultsRef.current) {
      assetResultsRef.current.scrollTop = 0;
    }
  }, [query, showShiny]);

  useEffect(() => {
    const target = assetResultsRef.current;
    if (!target) {
      return;
    }

    const updateHeight = () => {
      setViewportState((current) => ({ ...current, height: target.clientHeight || current.height }));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const releaseMemory = () => {
      setVisibleLimit(assetLibraryInitialLimit);
      setViewportState((current) => ({ ...current, scrollTop: 0 }));
      if (assetResultsRef.current) {
        assetResultsRef.current.scrollTop = 0;
      }
    };
    window.addEventListener("rock-roster-release-memory", releaseMemory);
    return () => window.removeEventListener("rock-roster-release-memory", releaseMemory);
  }, []);

  const handleAssetScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    setViewportState((current) => ({
      scrollTop: target.scrollTop,
      height: target.clientHeight || current.height
    }));
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 96;
    if (nearBottom) {
      setVisibleLimit((current) => getNextAssetLibraryLimit(current, totalMatches));
    }
  };

  const handleAssetDragStart = (event: DragEvent<HTMLDivElement>, asset: PetAsset) => {
    event.dataTransfer.setData("application/x-rock-roster-asset-id", asset.id);
    event.dataTransfer.setData("text/plain", asset.name);
    event.dataTransfer.effectAllowed = "copy";
  };

  const rowHeight = 60;
  const overscanRows = 8;
  const firstVirtualIndex = Math.max(0, Math.floor(viewportState.scrollTop / rowHeight) - overscanRows);
  const virtualCount = Math.ceil(viewportState.height / rowHeight) + overscanRows * 2;
  const virtualItems = visible.slice(firstVirtualIndex, firstVirtualIndex + virtualCount);
  const virtualHeight = Math.max(visible.length * rowHeight, viewportState.height);

  return (
    <div className="asset-list">
      <div className="asset-summary">
        <strong>{assets.length}</strong>
        <span>洛克王国：世界素材</span>
      </div>
      <label className="toggle-row asset-shiny-toggle">
        <input
          type="checkbox"
          checked={showShiny}
          onChange={(event) => onShowShinyChange(event.currentTarget.checked)}
        />
        <span>显示异色</span>
        <em>{showShiny ? "已包含" : "默认隐藏"}</em>
      </label>
      <input
        className="asset-search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="搜索精灵名 / 别名"
      />
      <div className="asset-results" onScroll={handleAssetScroll} ref={assetResultsRef}>
        {visible.length === 0 && <div className="empty-assets">没有匹配素材</div>}
        {visible.length > 0 && (
          <div className="asset-virtual-spacer" style={{ height: virtualHeight }}>
            {virtualItems.map((asset, offset) => (
              <div
                className="asset-row asset-virtual-row"
                draggable
                onDragStart={(event) => handleAssetDragStart(event, asset)}
                key={asset.id}
                title="拖到右侧阵容槽可直接填入"
                style={{ transform: `translateY(${(firstVirtualIndex + offset) * rowHeight}px)` }}
              >
                <div className="asset-thumb">
                  <img src={assetImageSrc(asset, serverUrl)} alt={asset.name} loading="lazy" decoding="async" />
                </div>
                <div>
                  <strong>{asset.name}</strong>
                  <span>{asset.element || "未设属性"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="small-note">
        已显示 {visible.length}/{totalMatches}，滚动加载更多。
      </div>
    </div>
  );
}

interface TeamEditorProps {
  side: TeamSide;
  project: RosterProject;
  assets: PetAsset[];
  serverUrl: string;
  missingNames: string[];
  resolvedSlots: ResolvedRosterSlot[];
  showHealthControls: boolean;
  onSlotChange: (side: TeamSide, index: number, name: string) => void;
  onSlotAssetSelect: (side: TeamSide, index: number, asset: PetAsset) => void;
  onFormChange: (side: TeamSide, index: number, formAssetId: string) => void;
  onDefeatedChange: (side: TeamSide, index: number, defeated: boolean) => void;
  onHealthChange: (side: TeamSide, index: number, health: Partial<SlotHealth>) => void;
  onElementChange: (side: TeamSide, index: number, element: string) => void;
}

interface BetaFeaturesPanelProps {
  project: RosterProject;
  resolved: ResolvedRosterProject;
  serverUrl: string;
  healthBar: HealthBarStyle;
  onStyleChange: (patch: Partial<RosterProject["style"]>) => void;
  onHealthChange: (side: TeamSide, index: number, health: Partial<SlotHealth>) => void;
  onResetHealth: () => void;
}

function BetaFeaturesPanel({
  project,
  resolved,
  serverUrl,
  healthBar,
  onStyleChange,
  onHealthChange,
  onResetHealth
}: BetaFeaturesPanelProps) {
  const resolvedSlots = sides.flatMap((side) =>
    resolved.teams[side].slots.map((slot, index) => ({ side, slot, index }))
  );
  const filledSlots = resolvedSlots.filter(({ slot }) => slot.name.trim() || slot.asset);
  const avatarCandidateAssets = filledSlots
    .map(({ slot }) => slot.asset)
    .filter((asset): asset is PetAsset => Boolean(asset));
  const avatarAssistItems = resolvedSlots.map((item) => ({
    ...item,
    readiness: getAvatarAssistReadiness({ name: item.slot.name, asset: item.slot.asset }, avatarCandidateAssets)
  }));
  const avatarAssistStats = avatarAssistItems.reduce(
    (stats, item) => ({
      ...stats,
      [item.readiness.status]: stats[item.readiness.status] + 1
    }),
    { ready: 0, review: 0, missing: 0, empty: 0 }
  );

  return (
    <section className="panel-section beta-panel">
      <div className="section-title">Beta 功能</div>
      <div className="beta-hero">
        <span>内测</span>
        <strong>血条展示和小头像采集先放在这里</strong>
        <p>正式阵容、装修、OBS 和 PNG 导出不受影响。需要测试时再打开 Beta。</p>
      </div>

      <div className="beta-card">
        <div className="beta-card-head">
          <div>
            <strong>血条展示</strong>
            <span>手动调剩余血量，OBS 和导出使用同一状态。</span>
          </div>
          <em className={healthBar.visible ? "beta-status beta-status-on" : "beta-status"}>{healthBar.visible ? "已开启" : "未开启"}</em>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={healthBar.visible}
            onChange={(event) =>
              onStyleChange({
                healthBar: {
                  ...healthBar,
                  visible: event.currentTarget.checked
                }
              })
            }
          />
          <span>显示血条</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={healthBar.showPercent}
            disabled={!healthBar.visible}
            onChange={(event) =>
              onStyleChange({
                healthBar: {
                  ...healthBar,
                  showPercent: event.currentTarget.checked
                }
              })
            }
          />
          <span>显示百分比</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={healthBar.autoDefeatAtZero}
            onChange={(event) =>
              onStyleChange({
                healthBar: {
                  ...healthBar,
                  autoDefeatAtZero: event.currentTarget.checked
                }
              })
            }
          />
          <span>0% 自动战败</span>
        </label>
        <label className="field-row">
          <span>血条高度</span>
          <RangeInput
            min={3}
            max={18}
            step={1}
            value={healthBar.height}
            disabled={!healthBar.visible}
            onChange={(value) =>
              onStyleChange({
                healthBar: {
                  ...healthBar,
                  height: value
                }
              })
            }
          />
          <output>{healthBar.height}px</output>
        </label>
        <button type="button" className="style-reset" onClick={onResetHealth}>
          重置本场血量
        </button>
        <div className="beta-health-list">
          {sides.map((side) => (
            <div className="beta-team-health" key={side}>
              <div className="beta-team-title">{project.teams[side].label}</div>
              {resolved.teams[side].slots.map((slot, index) => (
                <div className={["beta-health-row", slot.asset ? "" : "beta-health-row-empty"].join(" ")} key={`${side}-${index}`}>
                  <span className="beta-slot-index">{index + 1}</span>
                  <span className="beta-slot-thumb">
                    {slot.asset ? <img src={assetImageSrc(slot.asset, serverUrl)} alt="" loading="lazy" /> : index + 1}
                  </span>
                  <strong>{slot.asset?.name ?? (slot.name || "空槽位")}</strong>
                  {slot.asset && healthBar.visible ? (
                    <SlotHealthControls
                      health={slot.health}
                      onChange={(health) => onHealthChange(side, index, health)}
                    />
                  ) : slot.asset ? (
                    <span className="beta-muted">开启血条后可调整</span>
                  ) : (
                    <span className="beta-muted">未匹配素材</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="beta-card">
        <div className="beta-card-head">
          <div>
            <strong>小头像匹配采集</strong>
            <span>只按当前阵容候选识别 HUD 小头像，近分结果需连续确认。</span>
          </div>
          <em className="beta-status">候选模式</em>
        </div>
        <div className="beta-capture-summary">
          <span>高置信 {avatarAssistStats.ready}/{Math.max(filledSlots.length, 1)}</span>
          <span>需确认 {avatarAssistStats.review}</span>
          <span>缺头像 {avatarAssistStats.missing}</span>
        </div>
        <div className="beta-avatar-grid">
          {avatarAssistItems.map(({ side, slot, index, readiness }) => (
            <div className={["beta-avatar-item", `beta-avatar-${readiness.status}`].join(" ")} key={`${side}-${index}`}>
              <span>{side === "left" ? "左" : "右"}{index + 1}</span>
              {slot.asset?.avatarPath ? (
                <img src={assetAvatarSrc(slot.asset, serverUrl)} alt="" loading="lazy" />
              ) : (
                <em>无头像</em>
              )}
              <div className="beta-avatar-meta">
                <strong>{slot.asset?.name ?? (slot.name || "空")}</strong>
                <small>{readiness.detail}</small>
              </div>
              <b className="beta-avatar-state">{readiness.title}</b>
            </div>
          ))}
        </div>
        <p className="beta-note">
          识别策略：采集战斗 HUD 小头像区域，用遮挡 mask 排除属性图标，只在当前阵容候选内匹配。前两名分差低于 1.5%，或最近帧未稳定指向同一只时，不自动切换精灵。
        </p>
      </div>
    </section>
  );
}

function TeamEditor({
  side,
  project,
  assets,
  serverUrl,
  missingNames,
  resolvedSlots,
  showHealthControls,
  onSlotChange,
  onSlotAssetSelect,
  onFormChange,
  onDefeatedChange,
  onHealthChange,
  onElementChange
}: TeamEditorProps) {
  const team = project.teams[side];
  const [activeSlot, setActiveSlot] = useState<number | undefined>();
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [draftNames, setDraftNames] = useState(() => team.slots.map((slot) => slot.name));
  const composingSlot = useRef<number | undefined>(undefined);

  useEffect(() => {
    setDraftNames((current) =>
      team.slots.map((slot, index) =>
        composingSlot.current === index ? current[index] ?? slot.name : slot.name
      )
    );
  }, [team.slots]);

  const selectSuggestion = (index: number, asset: PetAsset) => {
    setDraftNames((current) => current.map((name, slotIndex) => (slotIndex === index ? asset.name : name)));
    onSlotAssetSelect(side, index, asset);
    setActiveSlot(undefined);
    setHighlightedIndex(-1);
  };

  const commitDraftName = (index: number, name: string) => {
    setDraftNames((current) => current.map((item, slotIndex) => (slotIndex === index ? name : item)));
    onSlotChange(side, index, name);
  };

  const handleSlotDrop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    const assetId = event.dataTransfer.getData("application/x-rock-roster-asset-id");
    const asset = assets.find((item) => item.id === assetId);
    if (asset) {
      selectSuggestion(index, asset);
    }
  };

  return (
    <div className="team-editor">
      <div className="team-editor-header">
        <strong>{team.label}</strong>
        <span>{team.slots.filter((slot) => slot.name.trim()).length}/6</span>
      </div>
      {team.slots.map((slot, index) => {
        const draftName = draftNames[index] ?? slot.name;
        const resolvedSlot = resolvedSlots[index];
        const selectedFormId = slot.formAssetId || resolvedSlot?.formAssetId || resolvedSlot?.asset?.id || "";
        const rawFormOptions = resolvedSlot?.formOptions ?? [];
        const showShinyForms = project.assetLibrary?.showShiny ?? false;
        const formOptions = showShinyForms
          ? rawFormOptions
          : rawFormOptions.filter((asset) => !isShinyAsset(asset) || asset.id === selectedFormId);
        const hasAsset = Boolean(resolvedSlot?.asset);
        const isMissing = Boolean(draftName.trim()) && !hasAsset;
        const isDefeated = slot.defeated ?? resolvedSlot?.defeated ?? false;
        const suggestions =
          activeSlot === index ? getPetSuggestions(draftName, assets, 8) : [];

        return (
          <div
            className={[
              "slot-editor",
              hasAsset ? "slot-editor-ready" : "",
              isMissing ? "slot-editor-missing" : "",
              isDefeated ? "slot-editor-defeated" : ""
            ].join(" ")}
            key={`${side}-${index}`}
          >
            <span className="slot-index">{index + 1}</span>
            <div className="slot-main">
              <div className="slot-topline">
            <div
              className="slot-input-wrap"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleSlotDrop(event, index)}
            >
              <span className="slot-asset-thumb" aria-hidden="true">
                {resolvedSlot?.asset ? (
                  <img src={assetImageSrc(resolvedSlot.asset, serverUrl)} alt="" loading="lazy" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              <input
                className="slot-name-input"
                value={draftName}
                onChange={(event) => {
                  setActiveSlot(index);
                  setHighlightedIndex(-1);
                  const nextName = event.currentTarget.value;
                  setDraftNames((current) =>
                    current.map((name, slotIndex) => (slotIndex === index ? nextName : name))
                  );
                  const nativeEvent = event.nativeEvent as InputEvent & { isComposing?: boolean };
                  if (composingSlot.current !== index && !nativeEvent.isComposing) {
                    onSlotChange(side, index, nextName);
                  }
                }}
                onCompositionStart={() => {
                  composingSlot.current = index;
                }}
                onCompositionEnd={(event) => {
                  composingSlot.current = undefined;
                  commitDraftName(index, event.currentTarget.value);
                }}
                onFocus={() => {
                  setActiveSlot(index);
                  setHighlightedIndex(-1);
                }}
                onBlur={(event) => {
                  if (composingSlot.current !== index && event.currentTarget.value !== slot.name) {
                    commitDraftName(index, event.currentTarget.value);
                  }
                  window.setTimeout(() => setActiveSlot(undefined), 120);
                }}
                onKeyDown={(event) => {
                  if (suggestions.length === 0) {
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlightedIndex((current) => (current + 1) % suggestions.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlightedIndex(
                      (current) => (current - 1 + suggestions.length) % suggestions.length
                    );
                  } else if (event.key === "Enter" && highlightedIndex >= 0) {
                    event.preventDefault();
                    selectSuggestion(index, suggestions[highlightedIndex].asset);
                  } else if (event.key === "Escape") {
                    setActiveSlot(undefined);
                    setHighlightedIndex(-1);
                  }
                }}
                placeholder="精灵名"
              />
              {suggestions.length > 0 && (
                <div className="suggestion-popover">
                  {suggestions.map((suggestion, suggestionIndex) => (
                    <button
                      type="button"
                      className={[
                        "suggestion-item",
                        highlightedIndex === suggestionIndex ? "suggestion-item-active" : ""
                      ].join(" ")}
                      key={suggestion.asset.id}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(index, suggestion.asset);
                      }}
                    >
                      <span className="suggestion-thumb">
                        <img
                          src={assetImageSrc(suggestion.asset, serverUrl)}
                          alt={suggestion.asset.name}
                        />
                      </span>
                      <span>
                        <strong>{suggestion.asset.name}</strong>
                        <em>
                          {suggestion.matchedAlias
                            ? `别名：${suggestion.matchedAlias}`
                            : suggestion.asset.element || "自动属性"}
                        </em>
                      </span>
                    </button>
                  ))}
                </div>
              )}
                </div>
                <span
                  className={[
                    "slot-status",
                    hasAsset ? "slot-status-ready" : "",
                    isMissing ? "slot-status-missing" : "",
                    !draftName.trim() ? "slot-status-empty" : ""
                  ].join(" ")}
                >
                  {hasAsset ? "已匹配" : isMissing ? "缺失" : "空"}
                </span>
              </div>
              <div className="slot-controls">
            <select
              className="form-select slot-control-select"
              value={selectedFormId}
              disabled={formOptions.length <= 1}
              onChange={(event) => onFormChange(side, index, event.currentTarget.value)}
              aria-label="形态"
              title="形态 / 首领化"
            >
              {formOptions.length === 0 ? (
                <option value="">无形态</option>
              ) : (
                formOptions.map((asset) => (
                  <option value={asset.id} key={asset.id}>
                    {formatPetFormOptionLabel(asset, formOptions)}
                  </option>
                ))
              )}
            </select>
            <select
              className="element-select slot-control-select"
              value={slot.element || ""}
              onChange={(event) => onElementChange(side, index, event.currentTarget.value)}
              aria-label="属性"
            >
              {elements.map((element) => (
                <option value={element} key={element || "auto"}>
                  {element || "自动"}
                </option>
              ))}
            </select>
            <label className="slot-defeated" title="战败">
              <input
                type="checkbox"
                checked={isDefeated}
                onChange={(event) => onDefeatedChange(side, index, event.currentTarget.checked)}
              />
              <span>败</span>
            </label>
              </div>
              {showHealthControls && hasAsset && (
                <SlotHealthControls
                  health={resolvedSlot.health}
                  onChange={(health) => onHealthChange(side, index, health)}
                />
              )}
            </div>
          </div>
        );
      })}
      {missingNames.length > 0 && <div className="team-warning">缺失：{missingNames.join("、")}</div>}
    </div>
  );
}

function SlotHealthControls({
  health,
  onChange
}: {
  health: SlotHealth;
  onChange: (health: Partial<SlotHealth>) => void;
}) {
  const percent = Math.round(health.percent);
  const updatePercent = (value: number) => onChange({ percent: value, visible: true, source: "manual" });
  return (
    <div className="slot-health-controls">
      <span>HP</span>
      <RangeInput min={0} max={100} step={1} value={percent} onChange={updatePercent} />
      <output>{percent}%</output>
      <div className="slot-health-quick">
        {[100, 50, 0].map((value) => (
          <button type="button" key={value} onClick={() => updatePercent(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function MissingSummary({ missingNames }: { missingNames: Record<TeamSide, string[]> }) {
  const all = [...missingNames.left.map((name) => `左队 ${name}`), ...missingNames.right.map((name) => `右队 ${name}`)];
  if (all.length === 0) {
    return <div className="missing-summary ok">素材完整</div>;
  }
  return <div className="missing-summary">缺失素材：{all.join("、")}</div>;
}

function getRoomTextRoleLabel(role: RoomTextBox["role"]): string {
  if (role === "title") {
    return "标题";
  }
  if (role === "player-left") {
    return "左选手";
  }
  if (role === "player-right") {
    return "右选手";
  }
  if (role === "score-left") {
    return "左比分";
  }
  if (role === "score-right") {
    return "右比分";
  }
  return "自由";
}

function toHexColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function getRoomAvatarHudPath(asset: PetAsset): string | undefined {
  if (!asset.avatarPath) {
    return undefined;
  }
  if (/^(https?:|data:|blob:)/.test(asset.avatarPath)) {
    return asset.avatarPath;
  }
  return asset.avatarPath.startsWith("assets/avatars/") ? asset.avatarPath : `assets/avatars/${asset.avatarPath}`;
}

function normalizeHudAvatarPath(path: string | undefined): string {
  if (!path) {
    return "";
  }
  if (/^(https?:|data:|blob:)/.test(path)) {
    return path;
  }
  return path.startsWith("assets/avatars/") ? path : `assets/avatars/${path}`;
}

function getRoomAvatarChoiceAssets(
  assets: PetAsset[],
  selectedPaths: Array<string | undefined>,
  query = ""
): PetAsset[] {
  const searchText = query.trim().toLowerCase();
  const selected = new Set(selectedPaths.map(normalizeHudAvatarPath).filter(Boolean));
  const withAvatar = assets.filter((asset) => Boolean(getRoomAvatarHudPath(asset)));
  if (searchText) {
    return withAvatar
      .filter((asset) => getRoomAvatarSearchText(asset).includes(searchText))
      .slice(0, roomAvatarChoiceLimit);
  }
  const selectedAssets = withAvatar.filter((asset) => selected.has(normalizeHudAvatarPath(getRoomAvatarHudPath(asset))));
  const rest = withAvatar.filter((asset) => !selected.has(normalizeHudAvatarPath(getRoomAvatarHudPath(asset))));
  return [...selectedAssets, ...rest].slice(0, roomAvatarChoiceLimit);
}

function getRoomAvatarSearchText(asset: PetAsset): string {
  return [asset.name, asset.baseName, asset.formLabel, asset.sourceNote, asset.id, ...(asset.aliases ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function assetImageSrc(asset: PetAsset, serverUrl: string): string {
  if (/^(https?:|data:|blob:)/.test(asset.imagePath)) {
    return asset.imagePath;
  }
  const fileName = asset.imagePath.replace(/^assets\/pets\//, "");
  return `${serverUrl}/assets/pets/${encodeURIComponent(fileName)}?v=${encodeURIComponent(asset.updatedAt)}`;
}

function assetAvatarSrc(asset: PetAsset, serverUrl: string): string {
  if (!asset.avatarPath) {
    return assetImageSrc(asset, serverUrl);
  }
  if (/^(https?:|data:|blob:)/.test(asset.avatarPath)) {
    return asset.avatarPath;
  }
  const fileName = asset.avatarPath.replace(/^assets\/avatars\//, "");
  return `${serverUrl}/assets/avatars/${encodeURIComponent(fileName)}?v=${encodeURIComponent(asset.updatedAt)}`;
}

