import { describe, expect, it } from "vitest";
import { drawParticipants, makePairs, type DrawCandidate } from "./draw";

const candidate = (id: string, overrides: Partial<DrawCandidate> = {}): DrawCandidate => ({
  id,
  registered: true,
  active: true,
  occupied: false,
  enabledActivityIds: ["fifa"],
  participationCount: 0,
  ...overrides,
});

describe("drawParticipants", () => {
  it("excludes inactive, unregistered, occupied and disabled participants", () => {
    const result = drawParticipants({
      candidates: [
        candidate("ok"),
        candidate("inactive", { active: false }),
        candidate("guest", { registered: false }),
        candidate("busy", { occupied: true }),
        candidate("disabled", { enabledActivityIds: [] }),
      ],
      activityId: "fifa",
      count: 1,
      random: () => 0.5,
    });
    expect(result.selected.map(({ id }) => id)).toEqual(["ok"]);
    expect(result.excluded.map(({ reason }) => reason)).toEqual([
      "inactive", "not_registered", "occupied", "activity_disabled",
    ]);
  });

  it("prioritizes players with fewer participations in balanced mode", () => {
    const result = drawParticipants({
      candidates: [candidate("veteran", { participationCount: 4 }), candidate("new")],
      activityId: "fifa",
      count: 1,
      random: () => 0.5,
    });
    expect(result.selected[0].id).toBe("new");
  });

  it("supports even pair creation and rejects odd groups explicitly", () => {
    expect(makePairs([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]]);
    expect(() => makePairs([1, 2, 3])).toThrow(/even number/);
  });
});
