import type { Json, SceneEventRow } from "@/types/database";

export const PAIRING_STORAGE_KEY = "level9.display.pairing.v1";
export const PROCESSED_STORAGE_KEY = "level9.display.processed.v1";

export interface DisplayPairing {
  eventId: string;
  deviceId: string;
  sessionToken: string;
}

export interface ScenePayload {
  title?: string;
  subtitle?: string;
  message?: string;
  activity?: string;
  player?: DisplayPlayer;
  players?: DisplayPlayer[];
  winner?: DisplayPlayer;
  score?: string;
  imageUrl?: string;
  videoUrl?: string;
  enabled?: boolean;
  volume?: number;
  action?: "pause" | "resume" | "skip" | "clear_queue";
  items?: string[];
}

export interface DisplayPlayer {
  name: string;
  number?: number;
  photoUrl?: string;
  gamerTag?: string;
}

export interface DisplayScene extends Omit<SceneEventRow, "payload" | "sound" | "animation"> {
  payload: ScenePayload;
  sound: { name?: string; volume?: number; loop?: boolean };
  animation: Record<string, Json | undefined>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePairing(value: string | null): DisplayPairing | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DisplayPairing>;
    if (!uuidPattern.test(parsed.eventId ?? "") || !uuidPattern.test(parsed.deviceId ?? "")) return null;
    if (typeof parsed.sessionToken !== "string" || parsed.sessionToken.length < 32 || parsed.sessionToken.length > 512) return null;
    return parsed as DisplayPairing;
  } catch {
    return null;
  }
}

const safeUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
};

const player = (value: unknown): DisplayPlayer | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== "string" || !raw.name.trim()) return undefined;
  return {
    name: raw.name.slice(0, 80),
    number: typeof raw.number === "number" ? raw.number : undefined,
    gamerTag: typeof raw.gamerTag === "string" ? raw.gamerTag.slice(0, 40) : undefined,
    photoUrl: safeUrl(raw.photoUrl),
  };
};

export function normalizeScene(row: SceneEventRow): DisplayScene {
  const raw = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {};
  const rawSound = row.sound && typeof row.sound === "object" && !Array.isArray(row.sound) ? row.sound as Record<string, unknown> : {};
  const rawAnimation = row.animation && typeof row.animation === "object" && !Array.isArray(row.animation) ? row.animation as Record<string, Json | undefined> : {};
  const players = Array.isArray(raw.players) ? raw.players.map(player).filter((item): item is DisplayPlayer => Boolean(item)) : undefined;
  return {
    ...row,
    payload: {
      title: typeof raw.title === "string" ? raw.title.slice(0, 120) : undefined,
      subtitle: typeof raw.subtitle === "string" ? raw.subtitle.slice(0, 160) : undefined,
      message: typeof raw.message === "string" ? raw.message.slice(0, 300) : undefined,
      activity: typeof raw.activity === "string" ? raw.activity.slice(0, 100) : undefined,
      score: typeof raw.score === "string" ? raw.score.slice(0, 30) : undefined,
      imageUrl: safeUrl(raw.imageUrl),
      videoUrl: safeUrl(raw.videoUrl),
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
      volume: typeof raw.volume === "number" ? Math.min(1, Math.max(0, raw.volume)) : undefined,
      action: ["pause","resume","skip","clear_queue"].includes(String(raw.action)) ? raw.action as ScenePayload["action"] : undefined,
      items: Array.isArray(raw.items) ? raw.items.filter((item):item is string=>typeof item==="string").slice(0,32).map(item=>item.slice(0,100)) : undefined,
      player: player(raw.player),
      winner: player(raw.winner),
      players,
    },
    sound: {
      name: typeof rawSound.name === "string" ? rawSound.name : undefined,
      volume: typeof rawSound.volume === "number" ? Math.min(1, Math.max(0, rawSound.volume)) : undefined,
      loop: rawSound.loop === true,
    },
    animation: rawAnimation,
  };
}

export function shouldAcceptScene(scene: DisplayScene, deviceId: string, processed: ReadonlySet<string>, now = Date.now()) {
  if (processed.has(scene.id) || (scene.target_device_id && scene.target_device_id !== deviceId)) return false;
  if (["played", "skipped", "expired", "failed", "cancelled"].includes(scene.status)) return false;
  const scheduled = Date.parse(scene.scheduled_at);
  if (!Number.isFinite(scheduled) || scheduled > now + 30_000) return false;
  const maxAge = Math.max(scene.duration_ms ?? 30_000, 60_000);
  return scheduled >= now - maxAge || scene.status === "playing";
}

