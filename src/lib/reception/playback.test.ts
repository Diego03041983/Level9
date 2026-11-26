import { describe, expect, it } from "vitest";
import { formatPlaybackClock, remainingPlaybackMs, type ReceptionPlayback } from "./playback";

const playback = (overrides: Partial<ReceptionPlayback> = {}): ReceptionPlayback => ({
  sceneId: "scene", sceneKey: "SCANNING", status: "playing", durationMs: 20_000,
  startedAt: "2026-11-26T12:00:00.000Z", pausedMs: 0, pausedAt: null, ...overrides,
});

describe("reception playback timing", () => {
  it("counts from the confirmed TV start", () => {
    expect(remainingPlaybackMs(playback(), Date.parse("2026-11-26T12:00:07.000Z"))).toBe(13_000);
  });

  it("freezes while paused and excludes completed pauses", () => {
    expect(remainingPlaybackMs(playback({ pausedMs: 3_000, pausedAt: "2026-11-26T12:00:08.000Z" }), Date.parse("2026-11-26T12:00:12.000Z"))).toBe(15_000);
  });

  it("formats the remaining time as a clock", () => {
    expect(formatPlaybackClock(61_001)).toBe("01:02");
  });
});
