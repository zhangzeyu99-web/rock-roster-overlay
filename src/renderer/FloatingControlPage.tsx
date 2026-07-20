import { type CSSProperties, type FocusEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, MonitorUp, Pin, PinOff, Settings, X } from "lucide-react";
import type { AppState, PetAsset, ResolvedRosterProject, RoomTextRole, RosterProject, TeamSide } from "../types";
import { isShinyAsset } from "../core/assetLibrary";
import {
  applyFloatingQuickImport,
  updateFloatingMatchInfo,
  updateFloatingSlotDefeated,
  updateFloatingSlotForm,
  type FloatingMatchInfoPatch
} from "../core/floatingControl";
import { formatPetFormOptionLabel } from "../core/forms";
import { FLOATING_GLASS_STRENGTH_MAX, normalizeFloatingControlSettings, resolveRosterProject } from "../core/project";
import { normalizeRoomDesign } from "../core/room";
import { getDesktopState, saveDesktopProject } from "./api";

const sides: TeamSide[] = ["left", "right"];
const sideLabels: Record<TeamSide, string> = { left: "左队", right: "右队" };

type FloatingStatus = "idle" | "saving" | "saved" | "error";

export function FloatingControlPage() {
  const [state, setState] = useState<AppState | undefined>();
  const [status, setStatus] = useState<FloatingStatus>("idle");
  const [statusText, setStatusText] = useState("等待操作");
  const [quickImportText, setQuickImportText] = useState("");
  const [pinned, setPinned] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [glassStrength, setGlassStrength] = useState(70);
  const [uiScaleSetting, setUiScaleSetting] = useState(60);
  const [matchDraft, setMatchDraft] = useState<FloatingMatchInfoPatch>({});
  const [hasDraftProject, setHasDraftProject] = useState(false);
  const matchDraftRef = useRef<FloatingMatchInfoPatch>({});
  const stateRef = useRef<AppState | undefined>(undefined);
  const draftProjectRef = useRef<RosterProject | undefined>(undefined);
  const matchSaveTimerRef = useRef<number | undefined>(undefined);
  const settingsSaveTimerRef = useRef<number | undefined>(undefined);
  const pendingSettingsPatchRef = useRef<Partial<NonNullable<RosterProject["floatingControl"]>>>({});
  const appliedPinnedRef = useRef<boolean | undefined>(undefined);

  const resolved = useMemo<ResolvedRosterProject | undefined>(() => {
    if (!state) {
      return undefined;
    }
    return resolveRosterProject(state.project, state.assets, state.liveState);
  }, [state]);

  const matchInfo = useMemo(() => getMatchInfo(state?.project), [state?.project]);

  useEffect(() => {
    void loadState();
    return window.roster?.onStateChanged(() => void loadState());
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (matchSaveTimerRef.current !== undefined) {
      const pendingDraft = { ...matchInfo, ...matchDraftRef.current };
      matchDraftRef.current = pendingDraft;
      setMatchDraft(pendingDraft);
      return;
    }
    matchDraftRef.current = matchInfo;
    setMatchDraft(matchInfo);
  }, [matchInfo.playerLeft, matchInfo.playerRight, matchInfo.scoreLeft, matchInfo.scoreRight]);

  useEffect(() => {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      return;
    }
    const settings = normalizeFloatingControlSettings(currentProject.floatingControl);
    setGlassStrength(settings.glassStrength);
    setUiScaleSetting(settings.uiScale);
    setPinned(settings.alwaysOnTop);
    if (appliedPinnedRef.current !== settings.alwaysOnTop) {
      appliedPinnedRef.current = settings.alwaysOnTop;
      void window.roster?.setControlWindowAlwaysOnTop(settings.alwaysOnTop);
    }
  }, [
    state?.project.id,
    state?.project.floatingControl?.glassStrength,
    state?.project.floatingControl?.uiScale,
    state?.project.floatingControl?.alwaysOnTop,
    state?.project.floatingControl?.liveSync
  ]);

  useEffect(() => {
    window.__ROSTER_SERVER_URL__ = state?.serverUrl;
  }, [state?.serverUrl]);

  useEffect(() => {
    return () => {
      if (matchSaveTimerRef.current) {
        window.clearTimeout(matchSaveTimerRef.current);
      }
      if (settingsSaveTimerRef.current) {
        window.clearTimeout(settingsSaveTimerRef.current);
      }
    };
  }, []);

  async function loadState() {
    try {
      const next = await getDesktopState();
      const draftProject = draftProjectRef.current;
      const displayState = draftProject ? replaceActiveProject(next, draftProject) ?? next : next;
      stateRef.current = displayState;
      setState(displayState);
      setStatus((current) => (current === "saving" ? current : "idle"));
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "状态读取失败");
    }
  }

  function getCurrentProject(): RosterProject | undefined {
    return draftProjectRef.current ?? stateRef.current?.project;
  }

  function stageProject(project: RosterProject, statusMessage = "已暂存，未同步直播") {
    draftProjectRef.current = project;
    setHasDraftProject(true);
    stateRef.current = replaceActiveProject(stateRef.current, project);
    setState((current) => replaceActiveProject(current, project));
    setStatus("idle");
    setStatusText(statusMessage);
  }

  function clearDraftProject() {
    draftProjectRef.current = undefined;
    setHasDraftProject(false);
  }

  function commitProjectChange(project: RosterProject, successText: string, options?: { forceSave?: boolean }) {
    const settings = normalizeFloatingControlSettings(project.floatingControl);
    if (!options?.forceSave && !settings.liveSync) {
      stageProject(project);
      return;
    }
    void persistProject(project, successText);
  }

  async function persistProject(project: RosterProject, successText: string) {
    setStatus("saving");
    stateRef.current = replaceActiveProject(stateRef.current, project);
    setState((current) => replaceActiveProject(current, project));
    setStatusText("同步中");
    try {
      const saved = await saveDesktopProject(project);
      clearDraftProject();
      stateRef.current = replaceActiveProject(stateRef.current, saved);
      setState((current) => replaceActiveProject(current, saved));
      setStatus("saved");
      setStatusText(successText);
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "同步失败");
    }
  }

  function applyQuickImport(side: TeamSide) {
    const currentProject = getCurrentProject();
    if (!state || !currentProject || !quickImportText.trim()) {
      return;
    }
    const { project, entries } = applyFloatingQuickImport(
      currentProject,
      side,
      quickImportText,
      getVisibleAssets(state)
    );
    const matchedCount = entries.filter((entry) => entry.matched).length;
    commitProjectChange(project, `已填入${sideLabels[side]} ${matchedCount}/${entries.length}`);
  }

  function changeSlotForm(side: TeamSide, index: number, formAssetId: string) {
    const currentProject = getCurrentProject();
    if (!state || !currentProject || !formAssetId) {
      return;
    }
    const asset = state.assets.find((item) => item.id === formAssetId);
    if (!asset || (!(currentProject.assetLibrary?.showShiny ?? false) && isShinyAsset(asset))) {
      return;
    }
    commitProjectChange(updateFloatingSlotForm(currentProject, side, index, asset), "形态已同步");
  }

  function changeDefeated(side: TeamSide, index: number, defeated: boolean) {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      return;
    }
    commitProjectChange(updateFloatingSlotDefeated(currentProject, side, index, defeated), "战败状态已同步");
  }

  function patchMatchInfo(patch: FloatingMatchInfoPatch) {
    const nextDraft = { ...matchDraftRef.current, ...patch };
    matchDraftRef.current = nextDraft;
    setMatchDraft(nextDraft);
    if (!state) {
      return;
    }
    if (matchSaveTimerRef.current) {
      window.clearTimeout(matchSaveTimerRef.current);
    }
    matchSaveTimerRef.current = window.setTimeout(() => {
      matchSaveTimerRef.current = undefined;
      const currentProject = getCurrentProject();
      if (!currentProject) {
        return;
      }
      commitProjectChange(updateFloatingMatchInfo(currentProject, nextDraft), "比赛信息已同步");
    }, 220);
  }

  function patchFloatingControlSettings(patch: Partial<NonNullable<RosterProject["floatingControl"]>>) {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      return;
    }
    pendingSettingsPatchRef.current = {};
    if (settingsSaveTimerRef.current) {
      window.clearTimeout(settingsSaveTimerRef.current);
      settingsSaveTimerRef.current = undefined;
    }
    const nextSettings = normalizeFloatingControlSettings({
      ...currentProject.floatingControl,
      glassStrength,
      uiScale: uiScaleSetting,
      ...patch
    });
    setGlassStrength(nextSettings.glassStrength);
    setUiScaleSetting(nextSettings.uiScale);
    setPinned(nextSettings.alwaysOnTop);
    const nextProject = {
      ...currentProject,
      floatingControl: nextSettings
    };
    setState((current) => replaceActiveProject(current, nextProject));
    if (settingsSaveTimerRef.current) {
      window.clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = window.setTimeout(() => {
      settingsSaveTimerRef.current = undefined;
      commitProjectChange(nextProject, "小窗设置已保存");
    }, 220);
  }

  function queueFloatingControlSettingsSave(patch: Partial<NonNullable<RosterProject["floatingControl"]>>) {
    pendingSettingsPatchRef.current = {
      ...pendingSettingsPatchRef.current,
      ...patch
    };
    if (settingsSaveTimerRef.current) {
      window.clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = window.setTimeout(() => {
      settingsSaveTimerRef.current = undefined;
      const currentState = stateRef.current;
      const currentProject = draftProjectRef.current ?? currentState?.project;
      if (!currentProject) {
        return;
      }
      const nextSettings = normalizeFloatingControlSettings({
        ...currentProject.floatingControl,
        ...pendingSettingsPatchRef.current
      });
      pendingSettingsPatchRef.current = {};
      const nextProject = {
        ...currentProject,
        floatingControl: nextSettings
      };
      commitProjectChange(nextProject, "小窗设置已保存");
    }, 220);
  }

  function changeGlassStrength(value: number) {
    const next = clampRange(value, 0, FLOATING_GLASS_STRENGTH_MAX);
    setGlassStrength(next);
    queueFloatingControlSettingsSave({ glassStrength: next });
  }

  function changeUiScaleSetting(value: number) {
    const next = clampRange(value, 0, 100);
    setUiScaleSetting(next);
    queueFloatingControlSettingsSave({ uiScale: next });
  }

  async function setPinnedState(next: boolean) {
    patchFloatingControlSettings({ alwaysOnTop: next });
    appliedPinnedRef.current = next;
    await window.roster?.setControlWindowAlwaysOnTop(next);
  }

  async function togglePinned() {
    await setPinnedState(!pinned);
  }

  function toggleLiveSync(enabled: boolean) {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      return;
    }
    const nextProject = {
      ...currentProject,
      floatingControl: normalizeFloatingControlSettings({
        ...currentProject.floatingControl,
        liveSync: enabled
      })
    };
    void persistProject(nextProject, enabled ? "自动同步已开启" : "自动同步已关闭");
  }

  if (!state || !resolved) {
    return (
      <main className="floating-control-shell">
        <div className="floating-empty">加载中</div>
      </main>
    );
  }

  const floatingSettings = normalizeFloatingControlSettings(state.project.floatingControl);
  const floatingLiveSync = floatingSettings.liveSync;
  const shellStyle = {
    "--floating-panel-opacity": glassStrengthToOpacity(glassStrength),
    "--floating-glass-blur": `${glassStrengthToBlur(glassStrength)}px`,
    "--floating-glass-saturate": glassStrengthToSaturate(glassStrength),
    "--floating-glass-brightness": glassStrengthToBrightness(glassStrength),
    "--floating-ui-scale": uiScaleSettingToCssScale(uiScaleSetting)
  } as CSSProperties;

  return (
    <main className="floating-control-shell" style={shellStyle}>
      <div className="floating-control-content">
        <header className="floating-titlebar">
          <div className="floating-title-lockup">
            <div className="floating-title-row">
              <MonitorUp size={18} />
              <strong>直播快捷控制</strong>
            </div>
            <span className={`floating-status floating-status-${status}`}>
              <span className="floating-status-dot" />
              {statusText}
            </span>
          </div>
          <div className="floating-window-actions">
            <button
              type="button"
              className="floating-settings-button floating-icon-button"
              onClick={() => setSettingsOpen((current) => !current)}
              title="设置"
            >
              <Settings size={15} />
            </button>
            <button
              type="button"
              className="floating-pin-button floating-icon-button"
              onClick={() => void togglePinned()}
              aria-pressed={pinned}
              title={pinned ? "取消置顶" : "置顶"}
            >
              {pinned ? <Pin size={15} /> : <PinOff size={15} />}
            </button>
            <button
              type="button"
              className="floating-icon-button"
              onClick={() => window.roster?.closeControlWindow()}
              title="关闭"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {settingsOpen ? (
          <section className="floating-settings-popover">
            <div className="floating-settings-head">
              <strong>快捷选项</strong>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  void window.roster?.focusMainWindow?.();
                }}
              >
                主界面
              </button>
            </div>
            <label className="floating-setting-range">
              <span>玻璃强度</span>
              <input
                type="range"
                className="range-input floating-setting-slider"
                min="0"
                max={FLOATING_GLASS_STRENGTH_MAX}
                step="1"
                value={glassStrength}
                style={
                  {
                    "--range-progress": `${(glassStrength / FLOATING_GLASS_STRENGTH_MAX) * 100}%`,
                    "--range-fill": "#8bbdff"
                  } as CSSProperties
                }
                onChange={(event) => changeGlassStrength(Number(event.currentTarget.value))}
              />
              <em>{formatGlassStrength(glassStrength)}</em>
            </label>
            <label className="floating-setting-range">
              <span>界面大小</span>
              <input
                type="range"
                className="range-input floating-setting-slider"
                min="0"
                max="100"
                step="1"
                value={uiScaleSetting}
                style={{ "--range-progress": `${uiScaleSetting}%`, "--range-fill": "#8bbdff" } as CSSProperties}
                onChange={(event) => changeUiScaleSetting(Number(event.currentTarget.value))}
              />
              <em>{formatUiScaleSetting(uiScaleSetting)}</em>
            </label>
            <label className="floating-setting-check">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(event) => void setPinnedState(event.currentTarget.checked)}
              />
              <span>保持最前</span>
            </label>
          </section>
        ) : null}

        <section className="floating-section floating-import">
          <div className="floating-section-head">
            <strong>快速导入阵容</strong>
            <label
              className={[
                "floating-sync-toggle",
                floatingLiveSync ? "floating-sync-toggle-on" : "floating-sync-toggle-off"
              ].join(" ")}
              title={floatingLiveSync ? "改动会自动同步到直播间" : "改动只在悬浮窗内暂存"}
            >
              <input
                type="checkbox"
                checked={floatingLiveSync}
                onChange={(event) => toggleLiveSync(event.currentTarget.checked)}
              />
              <span>{floatingLiveSync ? "自动同步" : hasDraftProject ? "有暂存" : "暂存"}</span>
            </label>
          </div>
          <div className="floating-import-row">
            <textarea
              value={quickImportText}
              onChange={(event) => setQuickImportText(event.currentTarget.value)}
              placeholder="粘贴阵容名，逗号或换行均可"
              rows={3}
            />
            <button type="button" className="floating-fill-left" onClick={() => applyQuickImport("left")}>
              填左队
            </button>
            <button type="button" className="floating-fill-right" onClick={() => applyQuickImport("right")}>
              填右队
            </button>
          </div>
        </section>

        <section className="floating-teams">
          {sides.map((side) => (
            <FloatingTeamControl
              key={side}
              side={side}
              resolved={resolved}
              showShiny={state.project.assetLibrary?.showShiny ?? false}
              serverUrl={state.serverUrl}
              onFormChange={changeSlotForm}
              onDefeatedChange={changeDefeated}
            />
          ))}
        </section>

        <section className="floating-section floating-match">
          <div className="floating-section-head">
            <strong>比赛信息</strong>
            <span>{floatingLiveSync ? "自动同步直播间" : "暂存未发布"}</span>
          </div>
          <div className="floating-match-panel">
            <div className="floating-match-side floating-match-left">
              <label>
                <span>左选手</span>
                <input
                  value={matchDraft.playerLeft ?? ""}
                  onChange={(event) => patchMatchInfo({ playerLeft: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>左比分</span>
                <input
                  inputMode="numeric"
                  value={matchDraft.scoreLeft ?? ""}
                  onChange={(event) => patchMatchInfo({ scoreLeft: event.currentTarget.value })}
                />
              </label>
            </div>
            <strong className="floating-match-versus">VS</strong>
            <div className="floating-match-side floating-match-right">
              <label>
                <span>右选手</span>
                <input
                  value={matchDraft.playerRight ?? ""}
                  onChange={(event) => patchMatchInfo({ playerRight: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>右比分</span>
                <input
                  inputMode="numeric"
                  value={matchDraft.scoreRight ?? ""}
                  onChange={(event) => patchMatchInfo({ scoreRight: event.currentTarget.value })}
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

interface FloatingTeamControlProps {
  side: TeamSide;
  resolved: ResolvedRosterProject;
  showShiny: boolean;
  serverUrl: string;
  onFormChange: (side: TeamSide, index: number, formAssetId: string) => void;
  onDefeatedChange: (side: TeamSide, index: number, defeated: boolean) => void;
}

function FloatingTeamControl({
  side,
  resolved,
  showShiny,
  serverUrl,
  onFormChange,
  onDefeatedChange
}: FloatingTeamControlProps) {
  return (
    <section className={`floating-section floating-team floating-team-${side}`}>
      <div className="floating-section-head">
        <strong>{sideLabels[side]}</strong>
        <span>{resolved.teams[side].slots.filter((slot) => slot.name.trim()).length}/6</span>
      </div>
      <div className="floating-slot-list">
        {resolved.teams[side].slots.map((slot, index) => {
          const selectedFormId = slot.formAssetId || slot.asset?.id || "";
          const formOptions = showShiny
            ? slot.formOptions
            : slot.formOptions.filter((asset) => !isShinyAsset(asset) || asset.id === selectedFormId);
          const disabled = formOptions.length <= 1;
          return (
            <div className="floating-slot-row" key={`${side}-${index}`}>
              <span className="floating-slot-index">{index + 1}</span>
              <span className="floating-slot-thumb">
                {slot.asset ? <img src={assetImageSrc(slot.asset, serverUrl)} alt="" /> : index + 1}
              </span>
              <span className="floating-slot-name" title={slot.asset?.name || slot.name || "空槽位"}>
                {slot.asset?.name || slot.name || "空槽位"}
              </span>
              <FloatingFormPicker
                side={side}
                index={index}
                value={selectedFormId}
                disabled={disabled}
                options={formOptions}
                onChange={(formAssetId) => onFormChange(side, index, formAssetId)}
              />
              <label className="floating-defeated">
                <input
                  type="checkbox"
                  checked={Boolean(slot.defeated)}
                  onChange={(event) => onDefeatedChange(side, index, event.currentTarget.checked)}
                />
                <span>败</span>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface FloatingFormPickerProps {
  side: TeamSide;
  index: number;
  value: string;
  disabled: boolean;
  options: PetAsset[];
  onChange: (formAssetId: string) => void;
}

function FloatingFormPicker({ side, index, value, disabled, options, onChange }: FloatingFormPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((asset) => asset.id === value);
  const label = selected ? formatPetFormOptionLabel(selected, options) : "无形态";

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setOpen(false);
    }
  }

  return (
    <div
      className={`floating-form-picker${open ? " floating-form-picker-open" : ""}${
        side === "right" || index >= 4 ? " floating-form-picker-up" : ""
      }`}
      onBlur={closeWhenFocusLeaves}
    >
      <button
        type="button"
        className="floating-form-trigger"
        disabled={disabled}
        aria-label={`${sideLabels[side]} ${index + 1} 形态`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="floating-form-menu" role="listbox">
          {options.length === 0 ? (
            <button type="button" className="floating-form-option" disabled>
              无形态
            </button>
          ) : (
            options.map((asset) => {
              const active = asset.id === value;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`floating-form-option${active ? " floating-form-option-active" : ""}`}
                  key={asset.id}
                  onClick={() => {
                    onChange(asset.id);
                    setOpen(false);
                  }}
                >
                  {active ? <CheckCircle2 size={14} /> : <span className="floating-form-option-spacer" />}
                  <span>{formatPetFormOptionLabel(asset, options)}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function getVisibleAssets(state: AppState): PetAsset[] {
  return state.project.assetLibrary?.showShiny
    ? state.assets
    : state.assets.filter((asset) => !isShinyAsset(asset));
}

function getMatchInfo(project: RosterProject | undefined): FloatingMatchInfoPatch {
  const room = normalizeRoomDesign(project?.room);
  const byRole = new Map<RoomTextRole, string>(room.textBoxes.map((box) => [box.role, box.text]));
  return {
    playerLeft: byRole.get("player-left") ?? "",
    playerRight: byRole.get("player-right") ?? "",
    scoreLeft: byRole.get("score-left") ?? "",
    scoreRight: byRole.get("score-right") ?? ""
  };
}

function replaceActiveProject(state: AppState | undefined, project: RosterProject): AppState | undefined {
  if (!state) {
    return state;
  }
  return {
    ...state,
    project,
    projects: state.projects?.length
      ? state.projects.map((item) => (item.id === project.id ? project : item))
      : [project]
  };
}

function assetImageSrc(asset: PetAsset, serverUrl: string): string {
  if (/^(https?:|data:|blob:)/.test(asset.imagePath)) {
    return asset.imagePath;
  }
  const fileName = asset.imagePath.split(/[\\/]/).pop() ?? asset.imagePath;
  return `${serverUrl}/assets/pets/${encodeURIComponent(fileName)}?v=${encodeURIComponent(asset.updatedAt)}`;
}

function glassStrengthToOpacity(value: number): number {
  const normalized = clampRange(value, 0, FLOATING_GLASS_STRENGTH_MAX);
  if (normalized <= 100) {
    return roundCssNumber(0.72 + (normalized / 100) * 0.24);
  }
  return roundCssNumber(0.96 + ((normalized - 100) / (FLOATING_GLASS_STRENGTH_MAX - 100)) * 0.025);
}

function glassStrengthToBlur(value: number): number {
  const normalized = clampRange(value, 0, FLOATING_GLASS_STRENGTH_MAX);
  if (normalized <= 100) {
    return Math.round(40 + (normalized / 100) * 18);
  }
  return Math.round(58 + ((normalized - 100) / (FLOATING_GLASS_STRENGTH_MAX - 100)) * 10);
}

function glassStrengthToSaturate(value: number): number {
  const normalized = clampRange(value, 0, FLOATING_GLASS_STRENGTH_MAX);
  if (normalized <= 100) {
    return roundCssNumber(1.6 + (normalized / 100) * 0.5);
  }
  return roundCssNumber(2.1 + ((normalized - 100) / (FLOATING_GLASS_STRENGTH_MAX - 100)) * 0.18);
}

function glassStrengthToBrightness(value: number): number {
  const normalized = clampRange(value, 0, FLOATING_GLASS_STRENGTH_MAX);
  if (normalized <= 100) {
    return 1.06;
  }
  return roundCssNumber(1.06 - ((normalized - 100) / (FLOATING_GLASS_STRENGTH_MAX - 100)) * 0.025);
}

function uiScaleSettingToCssScale(value: number): number {
  return 0.88 + (clampRange(value, 0, 100) / 100) * 0.14;
}

function formatGlassStrength(value: number): string {
  const normalized = clampRange(value, 0, FLOATING_GLASS_STRENGTH_MAX);
  if (normalized <= 25) {
    return "清透";
  }
  if (normalized <= 60) {
    return "均衡";
  }
  if (normalized <= 85) {
    return "清晰";
  }
  if (normalized <= 110) {
    return "厚重";
  }
  if (normalized <= 128) {
    return "更厚";
  }
  return "极厚";
}

function formatUiScaleSetting(value: number): string {
  const normalized = clampRange(value, 0, 100);
  if (normalized <= 25) {
    return "紧凑";
  }
  if (normalized <= 70) {
    return "适中";
  }
  return "放大";
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function roundCssNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
