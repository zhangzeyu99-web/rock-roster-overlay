import { describe, expect, it } from "vitest";
import { resolvePetForm } from "../src/core/forms";
import { applyRosterSlotForm, updateRosterSlotName } from "../src/core/project";
import { normalizeRosterStyle, resolveRosterProject } from "../src/core/project";
import type { PetAsset, RosterProject } from "../src/types";

const seaForms: PetAsset[] = [
  {
    id: "sea-blue",
    name: "海枝枝（碧蓝珊瑚）",
    aliases: ["海枝枝碧蓝珊瑚"],
    element: "水/幽",
    imagePath: "sea-blue.png",
    sourceNote: "BWIKI 精灵图鉴 NO.220 | 地区形态 | JL haizhizhi bilanshanhu.png",
    updatedAt: "now"
  },
  {
    id: "sea-yellow",
    name: "海枝枝（杏黄百合）",
    aliases: ["海枝枝杏黄百合"],
    element: "水/幽",
    imagePath: "sea-yellow.png",
    sourceNote: "BWIKI 精灵图鉴 NO.220 | 地区形态 | JL haizhizhi xinghuangbaihe.png",
    updatedAt: "now"
  },
  {
    id: "sea-red",
    name: "海枝枝（洋红沙丁）",
    aliases: ["海枝枝洋红沙丁"],
    element: "水/幽",
    imagePath: "sea-red.png",
    sourceNote: "BWIKI 精灵图鉴 NO.220 | 地区形态 | JL haizhizhi yanghongshading.png",
    updatedAt: "now"
  },
  {
    id: "sea-green",
    name: "海枝枝（翠绿纶布）",
    aliases: ["海枝枝翠绿纶布"],
    element: "水/幽",
    imagePath: "sea-green.png",
    sourceNote: "BWIKI 精灵图鉴 NO.220 | 地区形态 | JL haizhizhi cuilvlunbu.png",
    updatedAt: "now"
  }
];

const fireForms: PetAsset[] = [
  {
    id: "fire-normal",
    name: "\u706b\u795e",
    aliases: [],
    element: "\u706b",
    imagePath: "007-huoshen.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.007 | \u4e09\u9636 | \u539f\u59cb\u5f62\u6001 | JL huoshen.png",
    updatedAt: "now"
  },
  {
    id: "fire-boss",
    name: "\u70c8\u706b\u6218\u795e",
    aliases: ["\u70c8\u706b\u6218\u795e\u9996\u9886", "\u9996\u9886\u70c8\u706b\u6218\u795e"],
    element: "\u706b",
    imagePath: "007-huoshen_shouling.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.007 | \u9996\u9886\u5f62\u6001 | JL huoshen shouling.png",
    updatedAt: "now"
  }
];

const seasonalBossForms: PetAsset[] = [
  {
    id: "season-normal-spring",
    name: "\u5c9a\u9e1f\uff08\u6625\u5929\u7684\u6837\u5b50\uff09",
    aliases: [],
    element: "\u7ffc",
    imagePath: "020-lanniao_spring.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.020 | \u539f\u59cb\u5f62\u6001 | JL lanniao spring.png",
    updatedAt: "now"
  },
  {
    id: "season-boss-spring",
    name: "\u971c\u7ffc\u9886\u4e3b\uff08\u6625\u5929\u7684\u6837\u5b50\uff09",
    aliases: [],
    element: "\u7ffc",
    imagePath: "020-lanniao_shouling_spring.png",
    sourceNote: "BWIKI \u7cbe\u7075\u56fe\u9274 NO.020 | \u9996\u9886\u5f62\u6001 | JL lanniao shouling spring.png",
    updatedAt: "now"
  }
];

function legacyProject(slot: Record<string, unknown> = {}): RosterProject {
  return {
    id: "default",
    name: "默认项目",
    teams: {
      left: {
        label: "左队",
        slots: [{ name: "海枝枝", ...slot }, ...Array.from({ length: 5 }, () => ({ name: "" }))]
      },
      right: {
        label: "右队",
        slots: Array.from({ length: 6 }, () => ({ name: "" }))
      }
    },
    style: {
      resolution: { width: 1920, height: 1080 },
      cardGap: 14,
      imageScale: 1,
      cardBackground: "transparent",
      showElementIcon: true
    }
  };
}

function fireProject(slot: Record<string, unknown> = {}): RosterProject {
  return legacyProject({ name: "\u706b\u795e", ...slot });
}

describe("v0.2.0 project resolution", () => {
  it("uses the soft cloud pet plate as the default card background", () => {
    const style = normalizeRosterStyle(undefined);

    expect(style.cardBackground).toBe("cloud");
    expect(style.cardPlateOutlineWidth).toBe(1);
    expect(style.imageScale).toBe(0.96);
    expect(style.cardPlateScale).toBe(1.02);
    expect(style.cardPlateYOffset).toBe(22);
    expect(style.teamVisibility).toEqual({ left: true, right: true });
    expect(normalizeRosterStyle({ cardBackground: "transparent" }).cardBackground).toBe("transparent");
    expect(normalizeRosterStyle({ cardBackground: "rectangle" }).cardBackground).toBe("rectangle");
    expect(normalizeRosterStyle({ cardBackground: "white" as never }).cardBackground).toBe("cloud");
    expect(normalizeRosterStyle({ cardPlateOutlineWidth: 99 }).cardPlateOutlineWidth).toBe(8);
    expect(normalizeRosterStyle({ cardPlateScale: 9 }).cardPlateScale).toBe(1.6);
    expect(normalizeRosterStyle({ cardPlateYOffset: 99 }).cardPlateYOffset).toBe(80);
  });

  it("adds v0.2.0 default style and slot state for legacy projects", () => {
    const resolved = resolveRosterProject(legacyProject(), seaForms);
    const style = resolved.style as any;
    const slot = resolved.teams.left.slots[0] as any;

    expect(style.defeatFilter).toEqual({ grayscale: 1, opacity: 0.55 });
    expect(style.cardPlateOutlineWidth).toBe(1);
    expect(style.imageScale).toBe(0.96);
    expect(style.cardPlateScale).toBe(1.02);
    expect(style.cardPlateYOffset).toBe(22);
    expect(style.obsWindow).toEqual({
      width: 420,
      height: 1080,
      alwaysOnTop: true,
      clickThrough: true
    });
    expect(style.teamLayout).toEqual({ mode: "curved", centerGap: 1540, verticalOffset: 0 });
    expect(style.teamVisibility).toEqual({ left: true, right: true });
    expect(slot.defeated).toBe(false);
    expect(slot.formAssetId).toBe(slot.asset?.id);
  });

  it("keeps independent team visibility settings for combined views", () => {
    expect(
      normalizeRosterStyle({
        teamVisibility: { left: false, right: true }
      }).teamVisibility
    ).toEqual({ left: false, right: true });
    expect(
      normalizeRosterStyle({
        teamVisibility: { left: true, right: false }
      }).teamVisibility
    ).toEqual({ left: true, right: false });
  });

  it("keeps old project files compatible while defaulting to the new curved roster layout", () => {
    expect(normalizeRosterStyle({ teamLayout: { centerGap: 1200, verticalOffset: 40 } }).teamLayout).toEqual({
      mode: "curved",
      centerGap: 1200,
      verticalOffset: 40
    });
    expect(
      normalizeRosterStyle({
        teamLayout: { mode: "vertical", centerGap: 1320, verticalOffset: -20 }
      }).teamLayout
    ).toEqual({
      mode: "vertical",
      centerGap: 1320,
      verticalOffset: -20
    });
    expect(
      normalizeRosterStyle({
        teamLayout: { mode: "stacked" as never, centerGap: 1320, verticalOffset: -20 }
      }).teamLayout?.mode
    ).toBe("curved");
  });

  it("migrates only the old 1440p default pet scale while preserving customized layouts", () => {
    const oldDefault = normalizeRosterStyle({
      resolution: { width: 2560, height: 1440 },
      cardGap: 8,
      imageScale: 1.06,
      teamLayout: { mode: "curved", centerGap: 1540, verticalOffset: 0 }
    });
    const customized = normalizeRosterStyle({
      resolution: { width: 2560, height: 1440 },
      cardGap: 20,
      imageScale: 1.06,
      teamLayout: { mode: "curved", centerGap: 1540, verticalOffset: 0 }
    });

    expect(oldDefault.imageScale).toBe(0.96);
    expect(customized.imageScale).toBe(1.06);
  });

  it("migrates the previous curved cloud preset but preserves the vertical v3.2.5 preset", () => {
    const previousCurved = normalizeRosterStyle({
      resolution: { width: 1920, height: 1080 },
      cardGap: 8,
      imageScale: 1.02,
      cardPlateScale: 1.08,
      cardPlateYOffset: 22,
      teamLayout: { mode: "curved", centerGap: 1540, verticalOffset: 0 }
    });
    const vertical = normalizeRosterStyle({
      resolution: { width: 1920, height: 1080 },
      cardGap: 8,
      imageScale: 1.02,
      cardPlateScale: 1.08,
      cardPlateYOffset: 22,
      teamLayout: { mode: "vertical", centerGap: 1540, verticalOffset: 0 }
    });

    expect(previousCurved.imageScale).toBe(0.96);
    expect(previousCurved.cardPlateScale).toBe(1.02);
    expect(vertical.imageScale).toBe(1.02);
    expect(vertical.cardPlateScale).toBe(1.08);
  });

  it("uses formAssetId as the actual rendered form without changing the input name", () => {
    const resolved = resolveRosterProject(legacyProject({ formAssetId: "sea-red" }), seaForms);
    const slot = resolved.teams.left.slots[0] as any;

    expect(slot.name).toBe("海枝枝");
    expect(slot.asset?.id).toBe("sea-red");
    expect(slot.asset?.name).toBe("海枝枝（洋红沙丁）");
  });

  it("returns same-chain form options for slot-level form switching", () => {
    const resolved = resolveRosterProject(legacyProject({ formAssetId: "sea-blue" }), seaForms);
    const slot = resolved.teams.left.slots[0] as any;

    expect(slot.formOptions.map((asset: PetAsset) => asset.id)).toEqual([
      "sea-blue",
      "sea-yellow",
      "sea-red",
      "sea-green"
    ]);
  });

  it("preserves defeated state on resolved slots", () => {
    const resolved = resolveRosterProject(legacyProject({ defeated: true }), seaForms);
    const slot = resolved.teams.left.slots[0] as any;

    expect(slot.defeated).toBe(true);
  });

  it("groups normal and boss assets from the same pokedex number for form switching", () => {
    const resolved = resolveRosterProject(fireProject(), fireForms);
    const slot = resolved.teams.left.slots[0] as any;

    expect(slot.asset?.id).toBe("fire-normal");
    expect(slot.formOptions.map((asset: PetAsset) => asset.id)).toEqual([
      "fire-normal",
      "fire-boss"
    ]);
  });

  it("supports reverse switching from boss form back to normal form", () => {
    const resolved = resolveRosterProject(
      fireProject({ name: "\u70c8\u706b\u6218\u795e", formAssetId: "fire-normal" }),
      fireForms
    );
    const slot = resolved.teams.left.slots[0] as any;

    expect(slot.asset?.id).toBe("fire-normal");
    expect(slot.formOptions.map((asset: PetAsset) => asset.id)).toEqual([
      "fire-normal",
      "fire-boss"
    ]);
  });

  it("renames the slot to the selected form when changing form from the editor", () => {
    expect(
      applyRosterSlotForm({ name: "\u706b\u795e", assetId: "fire-normal", element: "\u6c34" }, fireForms[1])
    ).toEqual({
      name: "\u70c8\u706b\u6218\u795e",
      assetId: "fire-boss",
      formAssetId: "fire-boss"
    });
    expect(
      applyRosterSlotForm({ name: "\u70c8\u706b\u6218\u795e", assetId: "fire-boss" }, fireForms[0])
    ).toEqual({
      name: "\u706b\u795e",
      assetId: "fire-normal",
      formAssetId: "fire-normal"
    });
  });

  it("clears stale asset and element state when a slot name is edited manually", () => {
    expect(
      updateRosterSlotName(
        {
          name: "\u706b\u795e",
          assetId: "fire-normal",
          formAssetId: "fire-normal",
          element: "\u706b",
          defeated: true
        },
        "\u6c34\u7075"
      )
    ).toEqual({
      name: "\u6c34\u7075",
      defeated: true
    });
  });

  it("disambiguates boss form labels when normal and boss forms share the same suffix", () => {
    expect(resolvePetForm(seasonalBossForms[0]).formLabel).toBe("\u6625\u5929\u7684\u6837\u5b50");
    expect(resolvePetForm(seasonalBossForms[1]).formLabel).toBe("\u9996\u9886\u00b7\u6625\u5929\u7684\u6837\u5b50");
  });
});
