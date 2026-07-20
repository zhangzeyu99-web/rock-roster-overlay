export interface FontOption {
  id: string;
  label: string;
  description: string;
  fontFamily: string;
  sample: string;
}

export const defaultFontFamily =
  '"MiSans", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

export const genshinFontFamily =
  '"HYWenHei Extended", "HYWenHei 85W", "HYWenHei-85W", "SDK_SC_Web", "MiSans", "Microsoft YaHei UI", sans-serif';

export const fontOptions: FontOption[] = [
  {
    id: "misans",
    label: "MiSans",
    description: "默认清晰",
    fontFamily: defaultFontFamily,
    sample: "火神"
  },
  {
    id: "genshin",
    label: "原神风格",
    description: "HYWenHei Extended",
    fontFamily: genshinFontFamily,
    sample: "洛克联赛"
  },
  {
    id: "system-ui",
    label: "系统界面",
    description: "Windows UI",
    fontFamily:
      '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "MiSans", sans-serif',
    sample: "迪莫"
  },
  {
    id: "hei",
    label: "黑体稳重",
    description: "粗标题可用",
    fontFamily: '"SimHei", "Microsoft YaHei UI", "MiSans", sans-serif',
    sample: "比分"
  }
];

export function getFontOptionById(id: string | undefined): FontOption | undefined {
  return fontOptions.find((option) => option.id === id);
}

export function getFontOptionByFamily(fontFamily: string | undefined): FontOption | undefined {
  const normalized = normalizeFontFamily(fontFamily);
  return fontOptions.find((option) => normalizeFontFamily(option.fontFamily) === normalized);
}

function normalizeFontFamily(fontFamily: string | undefined): string {
  return (fontFamily ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
