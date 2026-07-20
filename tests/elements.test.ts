import { describe, expect, it } from "vitest";
import { getElementColor, getElementIconFile, splitElements, worldElements } from "../src/core/elements";

describe("world element helpers", () => {
  it("keeps dual elements in display order", () => {
    expect(splitElements("虫/萌")).toEqual(["虫", "萌"]);
    expect(splitElements("电/光")).toEqual(["电", "光"]);
  });

  it("falls back to normal when the element is empty", () => {
    expect(splitElements(undefined)).toEqual(["普通"]);
    expect(splitElements("")).toEqual(["普通"]);
  });

  it("maps world elements to local native icon files", () => {
    expect(getElementIconFile("水")).toBe("water.png");
    expect(getElementIconFile("机械")).toBe("machine.png");
    expect(getElementIconFile("不存在")).toBeUndefined();
    expect(worldElements.filter(Boolean).every((element) => getElementIconFile(element))).toBe(true);
  });

  it("returns stable colors for known and unknown elements", () => {
    expect(getElementColor("水")).toBe("#3298e8");
    expect(getElementColor("不存在")).toBe("#8f99a8");
  });
});
