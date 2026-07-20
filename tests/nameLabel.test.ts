import { describe, expect, it } from "vitest";
import {
  getNameLabelPresetStyle,
  getPetDisplayName,
  nameLabelPresets,
  normalizeNameLabelStyle
} from "../src/core/nameLabel";

describe("name label", () => {
  it("uses bracketed form names only for matching and not for display", () => {
    expect(getPetDisplayName("海枝枝（碧蓝珊瑚）")).toBe("海枝枝");
    expect(getPetDisplayName("鸭吉吉（紧实的样子）")).toBe("鸭吉吉");
    expect(getPetDisplayName("霹雳迪迪（异色）")).toBe("霹雳迪迪");
    expect(getPetDisplayName("圆号鱼")).toBe("圆号鱼");
  });

  it("normalizes custom label style values into safe ranges", () => {
    const style = normalizeNameLabelStyle({
      fontSize: 99,
      borderWidth: -3,
      height: 10,
      minWidth: 400,
      verticalGap: 99
    });

    expect(style.fontSize).toBe(28);
    expect(style.borderWidth).toBe(0);
    expect(style.height).toBe(22);
    expect(style.minWidth).toBe(180);
    expect(style.verticalGap).toBe(18);
  });

  it("ships multiple polished label presets and uses the battle preset by default", () => {
    const style = normalizeNameLabelStyle();

    expect(nameLabelPresets.length).toBeGreaterThanOrEqual(4);
    expect(style.presetId).toBe("world-battle");
    expect(style.backgroundBottom).toBe("#3a3f46");
    expect(style.borderWidth).toBe(0);
    expect(style.fontFamily).toContain("MiSans");
    expect(style.minWidth).toBe(132);
    expect(getNameLabelPresetStyle("mist-blue").backgroundBottom).toBe("#2f5169");
    expect(getNameLabelPresetStyle("slate-soft").backgroundBottom).toBe("#eceff3");
    expect(getNameLabelPresetStyle("league-night").textColor).toBe("#fff6df");
    expect(getNameLabelPresetStyle("league-night").borderWidth).toBe(0);
  });

  it("normalizes a selected preset before applying manual overrides", () => {
    const style = normalizeNameLabelStyle({
      presetId: "slate-soft",
      fontSize: 22
    });

    expect(style.presetId).toBe("slate-soft");
    expect(style.backgroundBottom).toBe("#eceff3");
    expect(style.fontSize).toBe(22);
  });
});
