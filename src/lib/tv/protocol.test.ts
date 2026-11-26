import { describe, expect, it } from "vitest";
import { normalizeScene, parsePairing, queueDisplayScene, shouldAcceptScene, type DisplayScene } from "./protocol";
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
    expect(normalizeScene(row({payload:{videoUrl:"/assets/video/desafio-robux-glitch-v2.mp4"}})).payload.videoUrl).toBe("/assets/video/desafio-robux-glitch-v2.mp4");
    expect(normalizeScene(row({payload:{videoUrl:"javascript:alert(1)"}})).payload.videoUrl).toBeUndefined();
    expect(normalizeScene(row({payload:{videoUrl:"//inseguro.example/video.mp4"}})).payload.videoUrl).toBeUndefined();
  });
  it("normalizes private NEXUS media after server hydration", () => {
    const scene = normalizeScene(row({scene_type:"NEXUS_IDENTITY_REVEAL",payload:{sessionId:"session-1",firstName:"Mateo",playerNumber:7,videoUrl:"https://example.com/video.mp4",videoLoop:true,photoUrl:"https://example.com/photo.jpg"},sound:{url:"https://example.com/name.wav",cueMs:850,volume:.8}}));
    expect(scene.payload.sessionId).toBe("session-1");
    expect(scene.payload.firstName).toBe("Mateo");
    expect(scene.payload.videoLoop).toBe(true);
    expect(scene.sound).toMatchObject({url:"https://example.com/name.wav",cueMs:850,volume:.8});
  });
  it("normalizes safe composed audio sequences", () => {
    const scene = normalizeScene(row({sound:{sequence:[
      {kind:"audio",url:"https://example.com/fixed.wav",durationMs:1200,volume:.8,label:"Fijo"},
      {kind:"silence",durationMs:160,volume:0,label:"Pausa"},
      {kind:"audio",url:"javascript:alert(1)",durationMs:500,volume:1,label:"Inseguro"},
    ]}}));
    expect(scene.sound.sequence).toHaveLength(2);
    expect(scene.sound.sequence?.[0]).toMatchObject({kind:"audio",durationMs:1200,volume:.8});
    expect(scene.sound.sequence?.[1]).toMatchObject({kind:"silence",durationMs:160});
  });
  it("is idempotent and rejects stale scenes", () => {
    const scene = normalizeScene(row());
    expect(shouldAcceptScene(scene,"30000000-0000-4000-8000-000000000001",new Set([scene.id]))).toBe(false);
    expect(shouldAcceptScene(normalizeScene(row({scheduled_at:new Date(Date.now()-120_000).toISOString()})),"30000000-0000-4000-8000-000000000001",new Set())).toBe(false);
    expect(shouldAcceptScene(normalizeScene(row({status:"playing",scheduled_at:new Date(Date.now()-120_000).toISOString()})),"30000000-0000-4000-8000-000000000001",new Set())).toBe(false);
  });
  it("replaces earlier NEXUS stages from the same reception session", () => {
    const first = normalizeScene(row({id:"10000000-0000-4000-8000-000000000011",scene_type:"NEXUS_NICKNAME_REQUEST",payload:{sessionId:"session-1"},interrupt_policy:"force",created_at:"2026-11-26T12:00:00.000Z"}));
    const second = normalizeScene(row({id:"10000000-0000-4000-8000-000000000012",scene_type:"NEXUS_WAITING_NICKNAME",payload:{sessionId:"session-1"},interrupt_policy:"force",created_at:"2026-11-26T12:00:01.000Z"}));
    const third = normalizeScene(row({id:"10000000-0000-4000-8000-000000000013",scene_type:"NEXUS_NICKNAME_CONFIRMED",payload:{sessionId:"session-1"},interrupt_policy:"force",created_at:"2026-11-26T12:00:02.000Z"}));
    const state = queueDisplayScene(queueDisplayScene({current:first,pending:[]},second),third);
    expect(state.current?.id).toBe(third.id);
    expect(state.pending).toEqual([]);
  });
  it("ignores a delayed NEXUS response older than the active stage", () => {
    const older = normalizeScene(row({id:"10000000-0000-4000-8000-000000000021",scene_type:"NEXUS_NICKNAME_REQUEST",payload:{sessionId:"session-1"},interrupt_policy:"force",created_at:"2026-11-26T12:00:00.000Z"}));
    const newer = normalizeScene(row({id:"10000000-0000-4000-8000-000000000022",scene_type:"NEXUS_WAITING_NICKNAME",payload:{sessionId:"session-1"},interrupt_policy:"force",created_at:"2026-11-26T12:00:01.000Z"}));
    expect(queueDisplayScene({current:newer,pending:[]},older)).toEqual({current:newer,pending:[]});
  });
  it("keeps interrupted scenes from unrelated displays in the queue", () => {
    const active = normalizeScene(row({id:"10000000-0000-4000-8000-000000000031",scene_type:"MISSION_ALERT"})) as DisplayScene;
    const incoming = normalizeScene(row({id:"10000000-0000-4000-8000-000000000032",scene_type:"TREASURE_UNLOCKED",interrupt_policy:"force"})) as DisplayScene;
    const state = queueDisplayScene({current:active,pending:[]},incoming);
    expect(state.current?.id).toBe(incoming.id);
    expect(state.pending.map(scene => scene.id)).toEqual([active.id]);
  });
});
