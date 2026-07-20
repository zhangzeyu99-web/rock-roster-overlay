export const worldElements = [
  "",
  "普通",
  "草",
  "火",
  "水",
  "光",
  "地",
  "冰",
  "龙",
  "电",
  "毒",
  "虫",
  "武",
  "翼",
  "萌",
  "幽",
  "恶",
  "机械",
  "幻"
];

export const elementIconFiles: Record<string, string> = {
  普通: "normal.png",
  草: "grass.png",
  火: "fire.png",
  水: "water.png",
  光: "light.png",
  地: "earth.png",
  冰: "ice.png",
  龙: "dragon.png",
  电: "electric.png",
  毒: "poison.png",
  虫: "bug.png",
  武: "martial.png",
  翼: "wing.png",
  萌: "cute.png",
  幽: "ghost.png",
  恶: "dark.png",
  机械: "machine.png",
  幻: "illusion.png"
};

export const elementColors: Record<string, string> = {
  普通: "#8f99a8",
  草: "#48b766",
  火: "#ef5c4e",
  水: "#3298e8",
  光: "#f5c84b",
  地: "#ba895a",
  冰: "#4eb7f0",
  龙: "#6b80e8",
  电: "#f0b828",
  毒: "#9d63d4",
  虫: "#76af37",
  武: "#d0733d",
  翼: "#6296ee",
  萌: "#f28ab7",
  幽: "#6861d9",
  恶: "#6b5a7b",
  机械: "#7e92a7",
  幻: "#55b8c8"
};

const fallbackElement = "普通";

export function splitElements(value: string | undefined): string[] {
  const elements = (value || fallbackElement)
    .split(/[\/、,，|]/)
    .map((element) => element.trim())
    .filter(Boolean);

  return (elements.length > 0 ? elements : [fallbackElement]).slice(0, 2);
}

export function getElementInitial(element: string): string {
  if (element === "普通") {
    return "普";
  }
  if (element === "机械") {
    return "机";
  }
  return element.slice(0, 1);
}

export function getElementIconFile(element: string): string | undefined {
  return elementIconFiles[element];
}

export function getElementColor(element: string): string {
  return elementColors[element] ?? elementColors[fallbackElement];
}
