import { describe, expect, it } from "vitest";
import { buildBreachPlayback } from "./breach";

const assets = [
  { logical_key: "mission-nexus-alarm-audio", storage_path: "nexus.mp3", metadata: { durationMs: 47840 } },
  { logical_key: "anomaly-detected", storage_path: "dry-voice.wav", metadata: { durationMs: 47840 } },
  { logical_key: "mission-glitch-video", storage_path: "glitch.mp4", metadata: { durationMs: 130304 } },
  { logical_key: "mission-breach-combined-video", storage_path: "obsolete.mp4", metadata: {} },
];
describe("sequential breach", () => {
  it("uses the original voice to animate Nexus and only the separate Glitch film", () => {
    expect(buildBreachPlayback(assets)).toEqual({ voicePath: "nexus.mp3", analysisPath: "dry-voice.wav", videoPath: "glitch.mp4", durationMs: 183144 });
  });
  it("rejects incomplete media rather than playing an overlapping fallback", () => {
    for (const key of ["mission-nexus-alarm-audio", "anomaly-detected", "mission-glitch-video"]) {
      expect(() => buildBreachPlayback(assets.filter(asset => asset.logical_key !== key))).toThrow(key);
    }
  });
});
