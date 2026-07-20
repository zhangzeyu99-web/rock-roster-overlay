import type { ProjectCollection, RosterProject } from "../types";
import {
  createDefaultRosterProject,
  normalizeAssetLibrarySettings,
  normalizeFloatingControlSettings,
  normalizeRosterStyle,
  normalizeSlots
} from "./project";
import { builtinRoomTitle, defaultRoomSeasonTitle, normalizeRoomDesign } from "./room";

const legacyDefaultSeasonTitle = "S2 洛克联赛";
const currentProjectDefaultsVersion = 1;

export function normalizeProject(project: RosterProject | undefined): RosterProject {
  const fallback = createDefaultRosterProject();
  const source = project ?? fallback;
  return {
    id: source.id || fallback.id,
    name: normalizeProjectName(source.name, fallback.name),
    defaultsVersion: currentProjectDefaultsVersion,
    teams: {
      left: {
        label: source.teams?.left?.label || "左队",
        slots: normalizeSlots(source.teams?.left?.slots ?? [])
      },
      right: {
        label: source.teams?.right?.label || "右队",
        slots: normalizeSlots(source.teams?.right?.slots ?? [])
      }
    },
    style: normalizeRosterStyle(source.style),
    room: normalizeRoomDesign(migrateDefaultProjectRoom(source)),
    assetLibrary: normalizeAssetLibrarySettings(source.assetLibrary),
    floatingControl: normalizeFloatingControlSettings(source.floatingControl)
  };
}

function migrateDefaultProjectRoom(project: RosterProject): RosterProject["room"] {
  if (project.id !== "default" || !project.room) {
    return project.room;
  }

  const textBoxes = project.room.textBoxes?.map((box) =>
    box.role === "title" && box.text.trim() === legacyDefaultSeasonTitle
      ? { ...box, text: defaultRoomSeasonTitle }
      : box
  );
  const titleImage = project.room.hud?.titleImage;
  const shouldHideLegacyDefaultTitleImage =
    (project.defaultsVersion ?? 0) < currentProjectDefaultsVersion &&
    titleImage?.visible === true &&
    (!titleImage.imagePath || titleImage.imagePath === builtinRoomTitle);

  const room = {
    ...project.room,
    ...(textBoxes ? { textBoxes } : {})
  };
  if (!shouldHideLegacyDefaultTitleImage || !project.room.hud || !titleImage) {
    return room;
  }

  return {
    ...room,
    hud: {
      ...project.room.hud,
      titleImage: { ...titleImage, visible: false }
    }
  };
}

export function normalizeProjectCollection(
  collection: ProjectCollection | undefined,
  fallbackProject: RosterProject = createDefaultRosterProject()
): ProjectCollection {
  const projects = (collection?.projects?.length ? collection.projects : [fallbackProject]).map((item) =>
    normalizeProject(item)
  );
  const activeProjectId = projects.some((item) => item.id === collection?.activeProjectId)
    ? collection!.activeProjectId
    : projects[0].id;
  return { activeProjectId, projects };
}

export function getActiveProject(collection: ProjectCollection): RosterProject {
  return (
    collection.projects.find((project) => project.id === collection.activeProjectId) ??
    collection.projects[0] ??
    createDefaultRosterProject()
  );
}

export function upsertProjectInCollection(
  collection: ProjectCollection,
  project: RosterProject
): ProjectCollection {
  const normalizedProject = normalizeProject(project);
  const existingIndex = collection.projects.findIndex((item) => item.id === normalizedProject.id);
  const projects =
    existingIndex >= 0
      ? collection.projects.map((item, index) => (index === existingIndex ? normalizedProject : item))
      : [...collection.projects, normalizedProject];
  return normalizeProjectCollection({
    activeProjectId: normalizedProject.id,
    projects
  });
}

export function activateProjectInCollection(
  collection: ProjectCollection,
  projectId: string
): ProjectCollection {
  const normalized = normalizeProjectCollection(collection);
  if (!normalized.projects.some((project) => project.id === projectId)) {
    return normalized;
  }
  return { ...normalized, activeProjectId: projectId };
}

export function createProjectFromTemplate(source: RosterProject, name: string): RosterProject {
  return {
    ...structuredClone(normalizeProject(source)),
    id: createProjectId(),
    name: normalizeProjectName(name, "新预设")
  };
}

function normalizeProjectName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed || fallback;
}

function createProjectId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `project-${crypto.randomUUID()}`;
  }
  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
