import { describe, expect, it } from "vitest";
import { resolveRosterProject } from "../src/core/project";
import type { PetAsset, RosterProject } from "../src/types";

const project: RosterProject = {
  id: "default",
  name: "默认项目",
  teams: {
    left: {
      label: "左队",
      slots: [
        { name: "迪莫" },
        { name: "雪影" },
        { name: "不存在" },
        { name: "" },
        { name: "" },
        { name: "" }
      ]
    },
    right: {
      label: "右队",
      slots: [
        { name: "霹雳迪迪" },
        { name: "石系小帅" },
        { name: "" },
        { name: "" },
        { name: "" },
        { name: "" }
      ]
    }
  },
  style: {
    resolution: { width: 1920, height: 1080 },
    cardGap: 16,
    imageScale: 1,
    cardBackground: "transparent",
    showElementIcon: true
  }
};

const assets: PetAsset[] = [
  {
    id: "dimo",
    name: "迪莫",
    aliases: [],
    element: "光",
    imagePath: "assets/pets/迪莫.png",
    updatedAt: "now"
  },
  {
    id: "snow",
    name: "雪影娃娃",
    aliases: ["雪影"],
    element: "冰",
    imagePath: "assets/pets/雪影娃娃.png",
    updatedAt: "now"
  },
  {
    id: "thunder",
    name: "霹雳迪迪",
    aliases: [],
    element: "电",
    imagePath: "assets/pets/霹雳迪迪.png",
    updatedAt: "now"
  }
];

describe("roster resolution", () => {
  it("always returns six resolved slots for each team", () => {
    const resolved = resolveRosterProject(project, assets);
    expect(resolved.teams.left.slots).toHaveLength(6);
    expect(resolved.teams.right.slots).toHaveLength(6);
  });

  it("binds both teams to exact or alias-matched assets", () => {
    const resolved = resolveRosterProject(project, assets);
    expect(resolved.teams.left.slots[0].asset?.id).toBe("dimo");
    expect(resolved.teams.left.slots[1].asset?.id).toBe("snow");
    expect(resolved.teams.right.slots[0].asset?.id).toBe("thunder");
  });

  it("lists missing named slots per team without treating blanks as missing", () => {
    expect(resolveRosterProject(project, assets).missingNames).toEqual({
      left: ["不存在"],
      right: ["石系小帅"]
    });
  });
});
