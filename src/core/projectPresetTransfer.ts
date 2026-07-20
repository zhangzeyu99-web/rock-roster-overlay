import type { RosterProject } from "../types";
import { normalizeProject } from "./projectPresets";

export const projectPresetFileKind = "rock-roster-overlay.project-preset";
export const projectPresetFileVersion = 1;

export interface ProjectPresetFile {
  kind: typeof projectPresetFileKind;
  version: typeof projectPresetFileVersion;
  appVersion?: string;
  exportedAt: string;
  project: RosterProject;
}

export interface ProjectPresetFileOptions {
  appVersion?: string;
  exportedAt?: string;
}

export function createProjectPresetFile(
  project: RosterProject,
  options: ProjectPresetFileOptions = {}
): ProjectPresetFile {
  return {
    kind: projectPresetFileKind,
    version: projectPresetFileVersion,
    appVersion: options.appVersion,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    project: normalizeProject(project)
  };
}

export function parseProjectPresetFile(value: unknown): RosterProject {
  if (!isRecord(value) || value.kind !== projectPresetFileKind || value.version !== projectPresetFileVersion) {
    throw new Error("not a roster project preset");
  }
  if (!isRecord(value.project)) {
    throw new Error("preset file is missing project data");
  }
  return normalizeProject(value.project as unknown as RosterProject);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
