import { describe, expect, it } from "vitest";
import {
  defaultFontFamily,
  fontOptions,
  genshinFontFamily,
  getFontOptionByFamily,
  getFontOptionById
} from "../src/core/fonts";

describe("font options", () => {
  it("keeps MiSans as the default readable font", () => {
    expect(defaultFontFamily).toContain("MiSans");
    expect(getFontOptionByFamily(defaultFontFamily)?.id).toBe("misans");
  });

  it("ships a built-in Genshin-style font option", () => {
    const option = getFontOptionById("genshin");

    expect(option?.label).toBe("原神风格");
    expect(genshinFontFamily).toContain("HYWenHei Extended");
    expect(option?.fontFamily).toBe(genshinFontFamily);
    expect(fontOptions.map((item) => item.id)).toContain("genshin");
  });
});
