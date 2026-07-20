import { describe, expect, it } from "vitest";
import {
  defaultHealthBarStyle,
  getHealthColor,
  getSlotKey,
  isHealthDefeated,
  normalizeHealthBarStyle,
  normalizeLiveRosterState,
  normalizeSlotHealth
} from "../src/core/health";
import { resolveRosterProject } from "../src/core/project";
import type { PetAsset, RosterProject } from "../src/types";

const asset: PetAsset = {
  id: "fire",
  name: "火神",
  aliases: [],
  element: "火",
  imagePath: "fire.png",
  updatedAt: "now"
};

const project: RosterProject = {
  id: "default",
  name: "默认项目",
  teams: {
    left: { label: "左队", slots: [{ name: "火神", assetId: "fire" }] },
    right: { label: "右队", slots: [] }
  },
  style: {
    resolution: { width: 1920, height: 1080 },
    cardGap: 8,
    imageScale: 1,
    cardBackground: "transparent",
    showElementIcon: true,
    healthBar: { visible: true, autoDefeatAtZero: true }
  }
};

describe("health state", () => {
  it("normalizes slot health and clamps percent", () => {
    expect(normalizeSlotHealth({ percent: 140, visible: false, source: "capture", confidence: 2 })).toEqual({
      percent: 100,
      visible: false,
      source: "capture",
      confidence: 1,
      updatedAt: undefined
    });
    expect(normalizeSlotHealth({ percent: -10 })).toMatchObject({ percent: 0, visible: true, source: "manual" });
  });

  it("normalizes health bar style with safe defaults", () => {
    expect(normalizeHealthBarStyle({ visible: true, height: 99, widthMode: "card" })).toMatchObject({
      ...defaultHealthBarStyle,
      visible: true,
      height: 18,
      widthMode: "card"
    });
  });

  it("keeps live health outside project slots and resolves defeated at zero", () => {
    const liveState = normalizeLiveRosterState("default", {
      health: {
        [getSlotKey("left", 0)]: { percent: 0, visible: true, source: "manual" }
      }
    });
    const resolved = resolveRosterProject(project, [asset], liveState);

    expect(project.teams.left.slots[0]).not.toHaveProperty("health");
    expect(resolved.teams.left.slots[0].health.percent).toBe(0);
    expect(resolved.teams.left.slots[0].defeated).toBe(true);
  });

  it("returns readable health colors by threshold", () => {
    const style = normalizeHealthBarStyle({ visible: true });

    expect(getHealthColor(80, style)).toBe(style.healthyColor);
    expect(getHealthColor(35, style)).toBe(style.warningColor);
    expect(getHealthColor(10, style)).toBe(style.dangerColor);
    expect(isHealthDefeated(normalizeSlotHealth({ percent: 0 }), style)).toBe(true);
  });
});
