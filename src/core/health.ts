import type { HealthBarStyle, LiveRosterState, SlotHealth, TeamSide } from "../types";

export const defaultHealthBarStyle: HealthBarStyle = {
  visible: false,
  showPercent: true,
  height: 6,
  gap: 3,
  widthMode: "name-label",
  healthyColor: "#34c759",
  warningColor: "#ffcc00",
  dangerColor: "#ff453a",
  trackColor: "rgba(16, 20, 28, 0.42)",
  textColor: "#ffffff",
  autoDefeatAtZero: true
};

export function getSlotKey(side: TeamSide, index: number): string {
  return `${side}:${index}`;
}

export function normalizeSlotHealth(input: Partial<SlotHealth> | undefined): SlotHealth {
  return {
    percent: clampPercent(input?.percent ?? 100),
    visible: input?.visible ?? true,
    source: input?.source === "capture" ? "capture" : "manual",
    confidence: normalizeConfidence(input?.confidence),
    updatedAt: input?.updatedAt
  };
}

export function normalizeHealthBarStyle(input: Partial<HealthBarStyle> | undefined): HealthBarStyle {
  return {
    visible: input?.visible ?? defaultHealthBarStyle.visible,
    showPercent: input?.showPercent ?? defaultHealthBarStyle.showPercent,
    height: clampNumber(input?.height, 3, 18, defaultHealthBarStyle.height),
    gap: clampNumber(input?.gap, 0, 12, defaultHealthBarStyle.gap),
    widthMode: input?.widthMode === "card" ? "card" : "name-label",
    healthyColor: input?.healthyColor || defaultHealthBarStyle.healthyColor,
    warningColor: input?.warningColor || defaultHealthBarStyle.warningColor,
    dangerColor: input?.dangerColor || defaultHealthBarStyle.dangerColor,
    trackColor: input?.trackColor || defaultHealthBarStyle.trackColor,
    textColor: input?.textColor || defaultHealthBarStyle.textColor,
    autoDefeatAtZero: input?.autoDefeatAtZero ?? defaultHealthBarStyle.autoDefeatAtZero
  };
}

export function normalizeLiveRosterState(
  projectId: string,
  input: Partial<LiveRosterState> | undefined
): LiveRosterState {
  const health: Record<string, SlotHealth> = {};
  for (const [key, value] of Object.entries(input?.health ?? {})) {
    health[key] = normalizeSlotHealth(value);
  }
  return {
    projectId,
    health,
    capture: input?.capture,
    updatedAt: input?.updatedAt ?? new Date().toISOString()
  };
}

export function getHealthColor(percent: number, style: HealthBarStyle): string {
  if (percent < 20) {
    return style.dangerColor;
  }
  if (percent < 50) {
    return style.warningColor;
  }
  return style.healthyColor;
}

export function isHealthDefeated(health: SlotHealth, style: HealthBarStyle): boolean {
  return style.autoDefeatAtZero && health.percent <= 0;
}

function clampPercent(value: unknown): number {
  return clampNumber(value, 0, 100, 100);
}

function normalizeConfidence(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return clampNumber(value, 0, 1, 0);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
