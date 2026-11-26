import { describe, expect, it } from "vitest";
import { audiovisualEventCatalog, findEventDefinition, initialAudioCatalog } from "./catalog";
import { mediaReadiness } from "./engine";

describe("audiovisual catalog", () => {
  it("keeps event keys and logical audio keys unique", () => {
    expect(new Set(audiovisualEventCatalog.map((item) => item.key)).size).toBe(audiovisualEventCatalog.length);
    expect(new Set(initialAudioCatalog.map(([key]) => key)).size).toBe(initialAudioCatalog.length);
  });

  it("assigns mission scenes the highest priority", () => {
    const breach = findEventDefinition("MISSION_BREACH");
    expect(breach).toMatchObject({ priority: 100, policy: "interrupt", sceneType: "NEXUS_SYSTEM_BREACH" });
  });

  it("reports preparation from active logical assets only", () => {
    const readiness = mediaReadiness([
      { id: "1", logical_key: "event-welcome", storage_path: "event/welcome.wav", default_volume: 1, metadata: {}, status: "active" },
      { id: "2", logical_key: "event-opening", storage_path: "event/opening.wav", default_volume: 1, metadata: {}, status: "disabled" },
    ]);
    expect(readiness.ready).toBe(1);
    expect(readiness.required.find((item) => item.key === "event-welcome")?.exists).toBe(true);
    expect(readiness.required.find((item) => item.key === "event-opening")?.exists).toBe(false);
  });
});
