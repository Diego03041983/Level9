import { describe, expect, it } from "vitest";
import { breachIntensity } from "./breach-intensity";

describe("progressive signal failure", () => {
  it("grows with the media clock, and stays identical while the audio is paused", () => {
    const values = [0, 12, 24, 36, 47].map(time => breachIntensity({ time, duration: 47.84 }));
    for (let i = 1; i < values.length; i++) expect(values[i].strength).toBeGreaterThan(values[i-1].strength);
    expect(breachIntensity({ time: 24, duration: 47.84 })).toEqual(values[2]);
    expect(values[3].collapse).toBe(0);
    expect(values[4].collapse).toBeGreaterThan(0);
  });
  it("handles unavailable metadata and clamps the end", () => {
    expect(breachIntensity({ time: 4, duration: NaN }).progress).toBe(0);
    expect(breachIntensity({ time: 4, duration: 0 }).progress).toBe(0);
    expect(breachIntensity({ time: 90, duration: 47.84 }).strength).toBe(1);
  });
});
