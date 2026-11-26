import { describe, expect, it } from "vitest";
import { shouldMuteNexusVideo } from "./nexusVideoAudio";
import { normalizeScene } from "../../lib/tv/protocol";
import type { SceneEventRow } from "../../types/database";

const scene = (sound: SceneEventRow["sound"] = {}) => normalizeScene({
  id: "10000000-0000-4000-8000-000000000001",
  event_id: "20000000-0000-4000-8000-000000000001",
  scene_type: "NEXUS_AVATAR_PROCESSING",
  payload: { state: "AVATAR_PROCESSING", videoUrl: "/avatar-processing.mp4" },
  priority: 88,
  duration_ms: 20_000,
  scheduled_at: "2026-11-26T12:00:00.000Z",
  sound,
  animation: {},
  interrupt_policy: "force",
  status: "queued",
  target_device_id: null,
  idempotency_key: "avatar-processing",
  created_by: null,
  created_at: "2026-11-26T12:00:00.000Z",
});

describe("NexusScene embedded video audio", () => {
  it("allows embedded MP4 audio when there is no separate scene audio", () => {
    expect(shouldMuteNexusVideo(scene(), false)).toBe(false);
  });

  it("mutes embedded audio when the display is muted or a WAV is assigned", () => {
    expect(shouldMuteNexusVideo(scene(), true)).toBe(true);
    expect(shouldMuteNexusVideo(scene({ url: "https://example.com/avatar.wav" }), false)).toBe(true);
  });
});
