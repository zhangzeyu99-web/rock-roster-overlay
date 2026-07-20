import type { PetAsset, RoomTextBox, RosterProject, TeamSide } from "../types";
import { applyRosterSlotForm, normalizeSlots } from "./project";
import { applyQuickImportToProject, resolveQuickImportEntries } from "./quickImport";
import { createCompetitionRoomDesign, normalizeRoomDesign, normalizeRoomTextBox } from "./room";

export interface FloatingMatchInfoPatch {
  playerLeft?: string;
  playerRight?: string;
  scoreLeft?: string;
  scoreRight?: string;
}

const matchInfoRoleByKey: Record<keyof FloatingMatchInfoPatch, RoomTextBox["role"]> = {
  playerLeft: "player-left",
  playerRight: "player-right",
  scoreLeft: "score-left",
  scoreRight: "score-right"
};

export function updateFloatingSlotForm(
  project: RosterProject,
  side: TeamSide,
  index: number,
  asset: PetAsset
): RosterProject {
  const next = structuredClone(project);
  next.teams[side].slots = normalizeSlots(next.teams[side].slots);
  next.teams[side].slots[index] = applyRosterSlotForm(next.teams[side].slots[index], asset);
  return next;
}

export function updateFloatingSlotDefeated(
  project: RosterProject,
  side: TeamSide,
  index: number,
  defeated: boolean
): RosterProject {
  const next = structuredClone(project);
  next.teams[side].slots = normalizeSlots(next.teams[side].slots);
  next.teams[side].slots[index] = {
    ...next.teams[side].slots[index],
    defeated
  };
  return next;
}

export function applyFloatingQuickImport(
  project: RosterProject,
  side: TeamSide,
  input: string,
  assets: PetAsset[]
) {
  const entries = resolveQuickImportEntries(input, assets);
  return {
    entries,
    project: applyQuickImportToProject(project, side, entries)
  };
}

export function updateFloatingMatchInfo(
  project: RosterProject,
  patch: FloatingMatchInfoPatch
): RosterProject {
  const next = structuredClone(project);
  const existingRoom = next.room;
  const competitionRoom = createCompetitionRoomDesign(existingRoom);
  const customTextBoxes = (existingRoom?.textBoxes ?? [])
    .filter((box) => box.role === "custom")
    .map((box, index) => normalizeRoomTextBox(box, competitionRoom.textBoxes.length + index));

  const patchedTextBoxes = competitionRoom.textBoxes.map((box) => {
    const patchEntry = Object.entries(matchInfoRoleByKey).find(([, role]) => role === box.role);
    if (!patchEntry) {
      return box;
    }
    const [key] = patchEntry as [keyof FloatingMatchInfoPatch, RoomTextBox["role"]];
    return typeof patch[key] === "string" ? { ...box, text: patch[key] } : box;
  });

  next.room = normalizeRoomDesign({
    ...competitionRoom,
    mode: "competition",
    textBoxes: [...patchedTextBoxes, ...customTextBoxes]
  });
  return next;
}
