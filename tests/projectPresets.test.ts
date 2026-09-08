import { describe, expect, it } from "vitest";
import type { ProjectCollection, RosterProject } from "../src/types";
import {
  createProjectFromTemplate,
  normalizeProject,
  normalizeProjectCollection,
  upsertProjectInCollection
} from "../src/core/projectPresets";
import { createDefaultRosterProject } from "../src/core/project";
import { builtinRoomTitle, defaultRoomSeasonTitle } from "../src/core/room";

function project(id: string, name: string): RosterProject {
  return {
    ...createDefaultRosterProject(),
    id,
    name
  };
}

describe("project presets", () => {
  it("migrates an old single project into a collection", () => {
    const collection = normalizeProjectCollection(undefined, project("default", "比赛预设"));

    expect(collection.activeProjectId).toBe("default");
    expect(collection.projects.map((item) => item.name)).toEqual(["比赛预设"]);
    expect(collection.projects[0].assetLibrary?.showShiny).toBe(false);
  });

  it("updates only the untouched default project season title", () => {
    const current = project("default", "默认项目");
    const archived = project("s2-archive", "S2 存档");
    for (const item of [current, archived]) {
      const title = item.room?.textBoxes.find((box) => box.role === "title");
      if (title) {
        title.text = "S2 洛克联赛";
      }
    }

    expect(normalizeProject(current).room?.textBoxes.find((box) => box.role === "title")?.text).toBe(
      defaultRoomSeasonTitle
    );
    expect(normalizeProject(archived).room?.textBoxes.find((box) => box.role === "title")?.text).toBe("S2 洛克联赛");
  });

  it("hides the legacy default title image once and preserves later user changes", () => {
    const legacy = project("default", "默认项目");
    legacy.defaultsVersion = undefined;
    if (legacy.room?.hud?.titleImage) {
      legacy.room.hud.titleImage.visible = true;
      legacy.room.hud.titleImage.imagePath = builtinRoomTitle;
    }

    const migrated = normalizeProject(legacy);
    expect(migrated.defaultsVersion).toBe(1);
    expect(migrated.room?.hud?.titleImage.visible).toBe(false);

    if (migrated.room?.hud?.titleImage) {
      migrated.room.hud.titleImage.visible = true;
    }
    expect(normalizeProject(migrated).room?.hud?.titleImage.visible).toBe(true);
  });

  it("upserts a project and makes it active", () => {
    const collection: ProjectCollection = {
      activeProjectId: "default",
      projects: [project("default", "默认项目")]
    };

    const next = upsertProjectInCollection(collection, project("match-a", "A 组比赛"));

    expect(next.activeProjectId).toBe("match-a");
    expect(next.projects.map((item) => item.id)).toEqual(["default", "match-a"]);
    expect(next.projects.at(1)?.name).toBe("A 组比赛");
  });

  it("creates a new project from the current one without sharing the id or name", () => {
    const source = project("default", "默认项目");
    source.teams.left.slots[0] = { name: "火神", assetId: "pet-fire" };
    source.assetLibrary = { showShiny: true };

    const next = createProjectFromTemplate(source, "新比赛");

    expect(next.id).not.toBe(source.id);
    expect(next.name).toBe("新比赛");
    expect(next.teams.left.slots[0]).toMatchObject({ name: "火神", assetId: "pet-fire" });
    expect(next.assetLibrary?.showShiny).toBe(true);
  });
});
