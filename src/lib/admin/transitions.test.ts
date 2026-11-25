import { describe, expect, it } from "vitest";
import { canApplyPlayerAction, playerTransition } from "./player-transitions";
import { canTransitionSchedule } from "./schedule-transitions";

describe("player transitions", () => {
  it("keeps pause operational without deactivating the participant", () => {
    expect(playerTransition("pause", "2026-11-29T16:00:00Z")).toMatchObject({ administrative_status: "active", operational_status: "resting" });
  });

  it("blocks invalid actions for the current state", () => {
    expect(canApplyPlayerAction("pause", "inactive", "unavailable")).toBe(false);
    expect(canApplyPlayerAction("reinstate", "withdrawn", "unavailable")).toBe(true);
  });
});

describe("schedule transitions", () => {
  it("supports live pause and resume but keeps terminal states terminal", () => {
    expect(canTransitionSchedule("live", "paused")).toBe(true);
    expect(canTransitionSchedule("paused", "live")).toBe(true);
    expect(canTransitionSchedule("finished", "live")).toBe(false);
    expect(canTransitionSchedule("cancelled", "scheduled")).toBe(false);
  });
});
