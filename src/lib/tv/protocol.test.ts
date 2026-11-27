import { describe, expect, it } from "vitest";
import { normalizeScene, parsePairing, queueDisplayScene, sceneRendersVideo, sceneUsesNexusFace, shouldAcceptScene, type DisplayScene } from "./protocol";
import { audiovisualEventCatalog } from "../audiovisual/catalog";
import type { SceneEventRow } from "@/types/database";

const row = (overrides: Partial<SceneEventRow> = {}): SceneEventRow => ({
  id: "10000000-0000-4000-8000-000000000001", event_id: "20000000-0000-4000-8000-000000000001",
  scene_type: "PLAYER_UNLOCKED", payload: { player: { name: "Santi", photoUrl: "javascript:alert(1)" } }, priority: 50,
  duration_ms: 10_000, scheduled_at: new Date().toISOString(), sound: {}, animation: {}, interrupt_policy: "queue",
  status: "queued", target_device_id: null, idempotency_key: "one", created_by: null, created_at: new Date().toISOString(), ...overrides,
});

describe("TV protocol", () => {
  it("replaces an old Glitch attempt and ignores late delivery of that attempt", () => {
    const old = normalizeScene(row({ payload: { eventKey: "MISSION_BREACH" }, created_at: "2026-11-27T12:00:00Z" }));
    const next = normalizeScene(row({ id: "10000000-0000-4000-8000-000000000099", payload: { eventKey: "MISSION_BREACH", breachSequence: true }, created_at: "2026-11-27T12:01:00Z" }));
    const state = queueDisplayScene({ current: old, pending: [] }, next);
    expect(state).toEqual({ current: next, pending: [] });
    expect(queueDisplayScene(state, old)).toEqual(state);
  });
  it("uses the speaking face for interactive acts, with only restored Nexus included from Mission", () => {
    for (const event of audiovisualEventCatalog) {
      const scene = normalizeScene(row({ scene_type: event.sceneType, payload: { eventKey: event.key, videoUrl: "/old-character.mp4" } }));
      const face = event.category !== "mission" || event.key === "NEXUS_RESTORED";
      expect(sceneUsesNexusFace(scene), event.key).toBe(face);
      expect(sceneRendersVideo(scene), event.key).toBe(!face);
    }
    const reception = normalizeScene(row({ scene_type: "NEXUS_DETECTION", payload: { sessionId: "reception", videoUrl: "/registration.mp4" } }));
    expect(sceneUsesNexusFace(reception)).toBe(false);
    expect(sceneRendersVideo(reception)).toBe(true);
  });
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
  it("starts audio for a FIFA photo announcement even if a character video is attached", () => {
    const fifa = normalizeScene(row({scene_type:"VERSUS_SCREEN",payload:{videoUrl:"https://example.com/nexus.mp4",players:[{name:"Dante"},{name:"Felipe"}]}}));
    expect(sceneRendersVideo(fifa)).toBe(false);
    expect(sceneRendersVideo(normalizeScene(row({scene_type:"NEXUS_DETECTION",payload:{videoUrl:"https://example.com/intro.mp4"}})))).toBe(true);
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
