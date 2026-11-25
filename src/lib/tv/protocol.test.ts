import { describe, expect, it } from "vitest";
import { normalizeScene, parsePairing, shouldAcceptScene } from "./protocol";
import type { SceneEventRow } from "@/types/database";

const row = (overrides: Partial<SceneEventRow> = {}): SceneEventRow => ({
  id: "10000000-0000-4000-8000-000000000001", event_id: "20000000-0000-4000-8000-000000000001",
  scene_type: "PLAYER_UNLOCKED", payload: { player: { name: "Santi", photoUrl: "javascript:alert(1)" } }, priority: 50,
  duration_ms: 10_000, scheduled_at: new Date().toISOString(), sound: {}, animation: {}, interrupt_policy: "queue",
  status: "queued", target_device_id: null, idempotency_key: "one", created_by: null, created_at: new Date().toISOString(), ...overrides,
});

describe("TV protocol", () => {
  it("rejects incomplete pairing data", () => expect(parsePairing('{"eventId":"no"}')).toBeNull());
  it("accepts a valid pairing envelope", () => {
    const pairing = parsePairing(JSON.stringify({eventId:"20000000-0000-4000-8000-000000000001",deviceId:"30000000-0000-4000-8000-000000000001",sessionToken:"x".repeat(32)}));
    expect(pairing?.deviceId).toContain("3000");
  });
  it("removes unsafe media URLs", () => expect(normalizeScene(row()).payload.player?.photoUrl).toBeUndefined());
  it("is idempotent and rejects stale scenes", () => {
    const scene = normalizeScene(row());
    expect(shouldAcceptScene(scene,"30000000-0000-4000-8000-000000000001",new Set([scene.id]))).toBe(false);
    expect(shouldAcceptScene(normalizeScene(row({scheduled_at:new Date(Date.now()-120_000).toISOString()})),"30000000-0000-4000-8000-000000000001",new Set())).toBe(false);
  });
});
