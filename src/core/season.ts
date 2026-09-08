import type { RosterProject, SeasonTheme, RoomTitleImageStyle } from "../types";
import { builtinRoomTitle, builtinS4RoomTitle, getDefaultRoomTitleTextStyle, normalizeRoomDesign, s4MoonTitleStyle } from "./room";

export const seasonThemes = [
  { id: "s4", name: "S4 月涌狂想", title: "S4·月涌狂想", playerBar: "s4-moon-relic" },
  { id: "s3", name: "S3 铅字幻梦", title: "S3·铅字幻梦", playerBar: "s3-clover-hinge" }
] as const;

export function applySeasonTheme(project: RosterProject, theme: SeasonTheme): RosterProject {
  const preset = seasonThemes.find((item) => item.id === theme)!;
  const room = normalizeRoomDesign(project.room);
  const titleStyle = theme === "s4" ? s4MoonTitleStyle : getDefaultRoomTitleTextStyle();
  return {
    ...project,
    style: { ...project.style, cloudTheme: theme },
    room: {
      ...room,
      textBoxes: room.textBoxes.map((box) => box.role === "title" ? {
        ...box,
        ...titleStyle,
        fontFamily: box.fontFamily,
        fontSize: box.fontSize,
        fontWeight: box.fontWeight,
        text: seasonThemes.some((item) => item.title === box.text) ? preset.title : box.text
      } : box),
      hud: {
        ...room.hud!,
        titleImage: getSeasonTitleImage(room.hud!.titleImage, theme),
        playerBar: { ...room.hud!.playerBar, preset: preset.playerBar }
      }
    }
  };
}

export function getAppliedSeasonTheme(project: RosterProject): SeasonTheme | undefined {
  const fill = project.room?.textBoxes.find((box) => box.role === "title")?.fillStyle;
  return seasonThemes.find((item) =>
    (project.style.cloudTheme ?? "s3") === item.id &&
    project.room?.hud?.playerBar.preset === item.playerBar &&
    fill === (item.id === "s4" ? "s4-moonlight" : "s3-lead-prism")
  )?.id;
}

export function getSeasonTitleImage(image: RoomTitleImageStyle, theme: SeasonTheme) {
  if (image.imagePath && image.imagePath !== builtinRoomTitle && image.imagePath !== builtinS4RoomTitle) return image;
  const standardSize = (image.x === 765 && image.y === 34 && image.width === 390 && image.height === 118) ||
    (image.x === 700 && image.y === 0 && image.width === 520 && image.height === 174);
  return {
    ...image,
    imagePath: theme === "s4" ? builtinS4RoomTitle : builtinRoomTitle,
    ...(standardSize ? theme === "s4" ? { x: 700, y: 0, width: 520, height: 174 } : { x: 765, y: 34, width: 390, height: 118 } : {})
  };
}
