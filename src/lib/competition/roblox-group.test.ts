import { describe, expect, it } from "vitest";
import { suggestRobloxGroup } from "./roblox-group";

describe("Roblox group suggestions", () => {
  it("never suggests a solo run", () => {
    expect(suggestRobloxGroup(["A"], 1, 3)).toEqual([]);
    expect(suggestRobloxGroup(["A","B","C"], 3, 1)).toEqual([]);
  });

  it("uses two players when two remain or only two PCs are free", () => {
    expect(suggestRobloxGroup(["A","B"], 2, 3)).toEqual(["A","B"]);
    expect(suggestRobloxGroup(["A","B","C"], 3, 2)).toEqual(["A","B"]);
  });

  it("splits four players into two pairs and five into three plus two", () => {
    const four = ["A","B","C","D"];
    const firstPair = suggestRobloxGroup(four, four.length, 3);
    expect(firstPair).toEqual(["A","B"]);
    expect(suggestRobloxGroup(four.slice(firstPair.length), 2, 3)).toEqual(["C","D"]);
    expect(suggestRobloxGroup(["A","B","C","D","E"], 5, 3)).toEqual(["A","B","C"]);
  });

  it("keeps four waiting players in pairs even when only three are free now", () => {
    expect(suggestRobloxGroup(["A","B","C"], 4, 3)).toEqual(["A","B"]);
  });
});
