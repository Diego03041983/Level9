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
  it("accepts local video assets and rejects unsafe video URLs", () => {
    expect(normalizeScene(row({payload:{videoUrl:"/assets/video/desafio-robux-glitch-v1.mp4"}})).payload.videoUrl).toBe("/assets/video/desafio-robux-glitch-v1.mp4");
    expect(normalizeScene(row({payload:{videoUrl:"javascript:alert(1)"}})).payload.videoUrl).toBeUndefined();
    expect(normalizeScene(row({payload:{videoUrl:"//inseguro.example/video.mp4"}})).payload.videoUrl).toBeUndefined();
  });
  it("normalizes private NEXUS media after server hydration", () => {
    const scene = normalizeScene(row({scene_type:"NEXUS_IDENTITY_REVEAL",payload:{firstName:"Mateo",playerNumber:7,videoUrl:"https://example.com/video.mp4",videoLoop:true,photoUrl:"https://example.com/photo.jpg"},sound:{url:"https://example.com/name.wav",cueMs:850,volume:.8}}));
    expect(scene.payload.firstName).toBe("Mateo");
    expect(scene.payload.videoLoop).toBe(true);
    expect(scene.sound).toMatchObject({url:"https://example.com/name.wav",cueMs:850,volume:.8});
  });
  it("is idempotent and rejects stale scenes", () => {
    const scene = normalizeScene(row());
    expect(shouldAcceptScene(scene,"30000000-0000-4000-8000-000000000001",new Set([scene.id]))).toBe(false);
    expect(shouldAcceptScene(normalizeScene(row({scheduled_at:new Date(Date.now()-120_000).toISOString()})),"30000000-0000-4000-8000-000000000001",new Set())).toBe(false);
  });
});
