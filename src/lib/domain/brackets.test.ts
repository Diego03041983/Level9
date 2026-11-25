import { describe, expect, it } from "vitest";
import { buildSingleEliminationBracket } from "./brackets";

describe("single elimination brackets", () => {
  it("creates the required 14-player FIFA bracket", () => {
    const bracket = buildSingleEliminationBracket(
      Array.from({ length: 14 }, (_, index) => ({ id: `p${index + 1}`, seed: index + 1 })),
    );
    expect(bracket.bracketSize).toBe(16);
    expect(bracket.byeEntryIds).toEqual(["p1", "p2"]);
    expect(bracket.rounds.map((round) => round.length)).toEqual([6, 4, 2, 1]);
    expect(bracket.totalMatches).toBe(13);
  });

  it("creates a 7-team bracket with one bye", () => {
    const bracket = buildSingleEliminationBracket(
      Array.from({ length: 7 }, (_, index) => ({ id: `t${index + 1}`, seed: index + 1 })),
    );
    expect(bracket.bracketSize).toBe(8);
    expect(bracket.byeEntryIds).toEqual(["t1"]);
    expect(bracket.rounds.map((round) => round.length)).toEqual([3, 2, 1]);
    expect(bracket.totalMatches).toBe(6);
  });
});
