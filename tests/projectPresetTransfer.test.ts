import { describe, expect, it } from "vitest";
import type { RosterProject } from "../src/types";
import { createDefaultRosterProject } from "../src/core/project";
import {
  createProjectPresetFile,
  parseProjectPresetFile,
  projectPresetFileKind
} from "../src/core/projectPresetTransfer";
import packageInfo from "../package.json";

const currentAppVersion = packageInfo.version;

function sampleProject(): RosterProject {
  const project = createDefaultRosterProject();
  project.id = "project-match-week-3";
  project.name = "Week 3 Stream";
  project.teams.left.slots[0] = {
    name: "Fire God",
    assetId: "pet-fire-god",
    formAssetId: "pet-fire-god-boss",
    element: "fire",
    defeated: true
  };
  project.assetLibrary = { showShiny: true };
  project.floatingControl = {
    glassStrength: 35,
    uiScale: 82,
    alwaysOnTop: false,
    liveSync: false
  };
  project.style.teamLayout = {
    mode: "vertical",
    centerGap: 1380,
    verticalOffset: -25
  };
  project.style.teamVisibility = { left: false, right: true };
  project.room = {
    mode: "competition",
    background: {
      visible: true,
      imagePath: "world-room-v3.png",
      fit: "cover",
      opacity: 1,
      dim: 0,
      edgeBlur: 12
    },
    textBoxes: [],
    guides: { visible: true, mode: "safe" }
  };
  return project;
}

describe("project preset transfer", () => {
  it("exports a project as a versioned preset file", () => {
    const preset = createProjectPresetFile(sampleProject(), {
      appVersion: currentAppVersion,
      exportedAt: "2026-06-24T12:00:00.000Z"
    });

    expect(preset.kind).toBe(projectPresetFileKind);
    expect(preset.version).toBe(1);
    expect(preset.appVersion).toBe(currentAppVersion);
    expect(preset.exportedAt).toBe("2026-06-24T12:00:00.000Z");
    expect(preset.project.id).toBe("project-match-week-3");
    expect(preset.project.assetLibrary?.showShiny).toBe(true);
    expect(preset.project.style.teamLayout).toEqual({
      mode: "vertical",
      centerGap: 1380,
      verticalOffset: -25
    });
    expect(preset.project.style.teamVisibility).toEqual({ left: false, right: true });
    expect(preset.project.floatingControl).toEqual({
      glassStrength: 35,
      uiScale: 82,
      alwaysOnTop: false,
      liveSync: false
    });
    expect(preset.project.room?.background.edgeBlur).toBe(12);
    expect(preset.project.teams.left.slots[0]).toMatchObject({
      name: "Fire God",
      assetId: "pet-fire-god",
      formAssetId: "pet-fire-god-boss",
      defeated: true
    });
  });

  it("imports the exported file back into a normalized project", () => {
    const source = createProjectPresetFile(sampleProject(), {
      appVersion: currentAppVersion,
      exportedAt: "2026-06-24T12:00:00.000Z"
    });

    const imported = parseProjectPresetFile(source);

    expect(imported.id).toBe("project-match-week-3");
    expect(imported.name).toBe("Week 3 Stream");
    expect(imported.assetLibrary?.showShiny).toBe(true);
    expect(imported.style.teamLayout).toEqual({
      mode: "vertical",
      centerGap: 1380,
      verticalOffset: -25
    });
    expect(imported.style.teamVisibility).toEqual({ left: false, right: true });
    expect(imported.floatingControl).toEqual({
      glassStrength: 35,
      uiScale: 82,
      alwaysOnTop: false,
      liveSync: false
    });
    expect(imported.room?.guides?.mode).toBe("safe");
    expect(imported.teams.left.slots[0].formAssetId).toBe("pet-fire-god-boss");
  });

  it("rejects files that are not roster project presets", () => {
    expect(() => parseProjectPresetFile({ kind: "other", version: 1, project: sampleProject() })).toThrow(
      "not a roster project preset"
    );
  });
});
