import { describe, expect, it } from "vitest";
import type { PetAsset, RosterProject } from "../src/types";
import {
  applyFloatingQuickImport,
  updateFloatingMatchInfo,
  updateFloatingSlotDefeated,
  updateFloatingSlotForm
} from "../src/core/floatingControl";
import { normalizeRoomDesign } from "../src/core/room";

const assets: PetAsset[] = [
  createAsset("pet-fire", "Fire", "fire", "fire-chain"),
  createAsset("pet-fire-boss", "Fire Boss", "fire", "fire-chain"),
  createAsset("pet-water", "Water", "water"),
  createAsset("pet-grass", "Grass", "grass"),
  createAsset("pet-light", "Light", "light"),
  createAsset("pet-dark", "Dark", "dark"),
  createAsset("pet-wing", "Wing", "wing"),
  createAsset("pet-rock", "Rock", "rock")
];

function createAsset(id: string, name: string, element: string, chainKey?: string): PetAsset {
  return {
    id,
    name,
    aliases: [],
    element,
    chainKey,
    imagePath: `${id}.png`,
    updatedAt: "2026-06-30T00:00:00.000Z"
  };
}

function createProject(): RosterProject {
  return {
    id: "default",
    name: "default",
    teams: {
      left: {
        label: "Left",
        slots: [
          { name: "Fire", assetId: "pet-fire", formAssetId: "pet-fire", element: "water" },
          ...Array.from({ length: 5 }, () => ({ name: "" }))
        ]
      },
      right: {
        label: "Right",
        slots: Array.from({ length: 6 }, () => ({ name: "" }))
      }
    },
    style: {
      resolution: { width: 1920, height: 1080 },
      cardGap: 14,
      imageScale: 1,
      cardBackground: "transparent",
      showElementIcon: true
    },
    room: normalizeRoomDesign({
      textBoxes: [
        { ...normalizeRoomDesign().textBoxes[0], role: "title", text: "S2" },
        { ...normalizeRoomDesign().textBoxes[1], role: "player-left", text: "Old Left" },
        { ...normalizeRoomDesign().textBoxes[2], role: "player-right", text: "Old Right" }
      ]
    })
  };
}

describe("floating control project updates", () => {
  it("switches a slot form and clears stale manual element overrides", () => {
    const project = updateFloatingSlotForm(createProject(), "left", 0, assets[1]);

    expect(project.teams.left.slots[0]).toMatchObject({
      name: "Fire Boss",
      assetId: "pet-fire-boss",
      formAssetId: "pet-fire-boss"
    });
    expect(project.teams.left.slots[0].element).toBeUndefined();
  });

  it("toggles defeated state for one slot without changing the other slots", () => {
    const project = updateFloatingSlotDefeated(createProject(), "left", 0, true);

    expect(project.teams.left.slots[0].defeated).toBe(true);
    expect(project.teams.left.slots[1].defeated).toBeUndefined();
    expect(project.teams.right.slots.every((slot) => slot.defeated === undefined)).toBe(true);
  });

  it("uses the existing quick import parser and continues into the opposite team", () => {
    const { project, entries } = applyFloatingQuickImport(
      createProject(),
      "left",
      "Fire,Water,Grass,Light,Dark,Wing,Rock",
      assets
    );

    expect(entries).toHaveLength(7);
    expect(project.teams.left.slots.map((slot) => slot.name)).toEqual([
      "Fire",
      "Water",
      "Grass",
      "Light",
      "Dark",
      "Wing"
    ]);
    expect(project.teams.right.slots[0]).toMatchObject({
      name: "Rock",
      assetId: "pet-rock",
      formAssetId: "pet-rock"
    });
  });

  it("updates fixed competition player and score text while keeping custom text out of scope", () => {
    const source = createProject();
    source.room = {
      ...normalizeRoomDesign(source.room),
      textBoxes: [
        ...(source.room?.textBoxes ?? []),
        { ...normalizeRoomDesign().textBoxes[0], id: "custom-note", role: "custom", text: "Do not edit" }
      ]
    };

    const project = updateFloatingMatchInfo(source, {
      playerLeft: "Alice",
      playerRight: "Bob",
      scoreLeft: "9",
      scoreRight: "1"
    });
    const boxes = new Map(project.room?.textBoxes.map((box) => [box.role, box.text]));

    expect(boxes.get("player-left")).toBe("Alice");
    expect(boxes.get("player-right")).toBe("Bob");
    expect(boxes.get("score-left")).toBe("9");
    expect(boxes.get("score-right")).toBe("1");
    expect(project.room?.textBoxes.find((box) => box.id === "custom-note")?.text).toBe("Do not edit");
  });
});
