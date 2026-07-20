import { describe, expect, it } from "vitest";
import { resolveRosterProject } from "../src/core/project";
import type { RosterProject } from "../src/types";

const project: RosterProject = {
  id: "default",
  name: "image-scale-test",
  teams: {
    left: { label: "left", slots: Array.from({ length: 6 }, () => ({ name: "" })) },
    right: { label: "right", slots: Array.from({ length: 6 }, () => ({ name: "" })) }
  },
  style: {
    resolution: { width: 1920, height: 1080 },
    cardGap: 14,
    imageScale: 1.7,
    cardBackground: "transparent",
    showElementIcon: true
  }
};

describe("image scale normalization", () => {
  it("keeps the larger 170 percent image scale limit", () => {
    expect(resolveRosterProject(project, []).style.imageScale).toBe(1.7);
  });

  it("clamps values above 170 percent", () => {
    expect(
      resolveRosterProject(
        {
          ...project,
          style: {
            ...project.style,
            imageScale: 1.9
          }
        },
        []
      ).style.imageScale
    ).toBe(1.7);
  });
});
