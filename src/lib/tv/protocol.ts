import type { Json, SceneEventRow } from "@/types/database";
import { usesNexusFace } from "../audiovisual/catalog";

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
  videoLoop?: boolean;
  audioBoundVideo?: boolean;
  breachSequence?: boolean;
  eventKey?: string;
  character?: string;
  rehearsal?: boolean;
  degraded?: boolean;
  missingAudio?: string[];
  station?: string;
  round?: string;
  sessionId?: string;
  participantId?: string;
  firstName?: string;
  lastName?: string;
  gamerTag?: string;
  playerNumber?: number;
  avatarKey?: string;
  photoUrl?: string;
  isCelebrant?: boolean;
  state?: string;
  enabled?: boolean;
  volume?: number;
  action?: "pause" | "resume" | "skip" | "clear_queue" | "stop" | "home";
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
  sound: { name?: string; url?: string; analysisUrl?: string; volume?: number; loop?: boolean; cueMs?: number; totalDurationMs?:number; sequence?:DisplayAudioSegment[] };
  animation: Record<string, Json | undefined>;
}

export interface DisplayAudioSegment {kind:"audio"|"silence";url?:string;durationMs:number;volume:number;label:string}

export interface DisplayPlaybackQueue {
  current: DisplayScene | null;
  pending: DisplayScene[];
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

const audioSegment=(value:unknown):DisplayAudioSegment|undefined=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
  const raw=value as Record<string,unknown>;const kind=raw.kind==="audio"||raw.kind==="silence"?raw.kind:undefined;if(!kind)return undefined;
  const url=safeUrl(raw.url);if(kind==="audio"&&!url)return undefined;
  return{kind,url,durationMs:typeof raw.durationMs==="number"?Math.min(3_600_000,Math.max(0,raw.durationMs)):0,volume:typeof raw.volume==="number"?Math.min(1,Math.max(0,raw.volume)):1,label:typeof raw.label==="string"?raw.label.slice(0,120):kind==="silence"?"Pausa":"Audio"};
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
      videoLoop: raw.videoLoop === true,
      audioBoundVideo: raw.audioBoundVideo === true,
      breachSequence: raw.breachSequence === true,
      eventKey: typeof raw.eventKey === "string" ? raw.eventKey.slice(0, 100) : undefined,
      character: typeof raw.character === "string" ? raw.character.slice(0, 80) : undefined,
      rehearsal: raw.rehearsal === true,
      degraded: raw.degraded === true,
      missingAudio: Array.isArray(raw.missingAudio) ? raw.missingAudio.filter((item):item is string=>typeof item==="string").slice(0,20).map(item=>item.slice(0,120)) : undefined,
      station: typeof raw.station === "string" ? raw.station.slice(0, 100) : undefined,
      round: typeof raw.round === "string" ? raw.round.slice(0, 80) : undefined,
      sessionId: typeof raw.sessionId === "string" ? raw.sessionId.slice(0, 100) : undefined,
      participantId: typeof raw.participantId === "string" ? raw.participantId : undefined,
      firstName: typeof raw.firstName === "string" ? raw.firstName.slice(0, 80) : undefined,
      lastName: typeof raw.lastName === "string" ? raw.lastName.slice(0, 80) : undefined,
      gamerTag: typeof raw.gamerTag === "string" ? raw.gamerTag.slice(0, 40) : undefined,
      playerNumber: typeof raw.playerNumber === "number" ? raw.playerNumber : undefined,
      avatarKey: typeof raw.avatarKey === "string" ? raw.avatarKey.slice(0, 40) : undefined,
      photoUrl: safeUrl(raw.photoUrl),
      isCelebrant: raw.isCelebrant === true,
      state: typeof raw.state === "string" ? raw.state.slice(0, 80) : undefined,
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
      volume: typeof raw.volume === "number" ? Math.min(1, Math.max(0, raw.volume)) : undefined,
      action: ["pause","resume","skip","clear_queue","stop","home"].includes(String(raw.action)) ? raw.action as ScenePayload["action"] : undefined,
      items: Array.isArray(raw.items) ? raw.items.filter((item):item is string=>typeof item==="string").slice(0,32).map(item=>item.slice(0,100)) : undefined,
      player: player(raw.player),
      winner: player(raw.winner),
      players,
    },
    sound: {
      name: typeof rawSound.name === "string" ? rawSound.name : undefined,
      url: safeUrl(rawSound.url),
      analysisUrl: safeUrl(rawSound.analysisUrl),
      volume: typeof rawSound.volume === "number" ? Math.min(1, Math.max(0, rawSound.volume)) : undefined,
      loop: rawSound.loop === true,
      cueMs: typeof rawSound.cueMs === "number" ? Math.min(600000, Math.max(0, rawSound.cueMs)) : undefined,
      totalDurationMs: typeof rawSound.totalDurationMs === "number" ? Math.min(3_600_000, Math.max(0, rawSound.totalDurationMs)) : undefined,
      sequence: Array.isArray(rawSound.sequence) ? rawSound.sequence.map(audioSegment).filter((item):item is DisplayAudioSegment=>Boolean(item)).slice(0,100) : undefined,
    },
    animation: rawAnimation,
  };
}

// An announcement may carry a character video even when its renderer shows
// player photos or a bracket instead.
export function sceneUsesNexusFace(scene: DisplayScene): boolean {
  return usesNexusFace(scene.payload.eventKey ?? "");
}

export function sceneIsBreachSequence(scene: DisplayScene): boolean {
  return scene.payload.eventKey === "MISSION_BREACH" && scene.payload.breachSequence === true;
}

export function sceneRendersVideo(scene: DisplayScene): boolean {
  if (sceneUsesNexusFace(scene)) return false;
  if (!scene.payload.videoUrl) return false;
  const type = scene.scene_type.toUpperCase();
  if (type.startsWith("NEXUS_")) return true;
  if (type === "TOURNAMENT_BRACKET" && scene.payload.items?.length) return false;
  if (type === "PLAYER_ROSTER" && scene.payload.players?.length && scene.payload.items?.length) return false;
  if (type === "DUO_VERSUS_SCREEN" && (scene.payload.players?.length ?? 0) >= 4) return false;
  if ((type === "VERSUS" || type === "VERSUS_SCREEN") && scene.payload.players?.length) return false;
  return true;
}

const sceneTime = (scene: DisplayScene) => {
  const createdAt = Date.parse(scene.created_at);
  if (Number.isFinite(createdAt)) return createdAt;
  const scheduledAt = Date.parse(scene.scheduled_at);
  return Number.isFinite(scheduledAt) ? scheduledAt : 0;
};

export const compareDisplaySceneOrder = (left: DisplayScene, right: DisplayScene) => {
  const timeDifference = sceneTime(left) - sceneTime(right);
  if (timeDifference !== 0) return timeDifference;
  return left.created_at.localeCompare(right.created_at) || left.scheduled_at.localeCompare(right.scheduled_at);
};

const sameNexusSession = (left: DisplayScene, right: DisplayScene) => {
  const leftSession = left.scene_type.toUpperCase().startsWith("NEXUS_") ? left.payload.sessionId : undefined;
  const rightSession = right.scene_type.toUpperCase().startsWith("NEXUS_") ? right.payload.sessionId : undefined;
  return Boolean(leftSession && rightSession && leftSession === rightSession);
};

const uniqueScenes = (scenes: DisplayScene[]) => scenes.filter((scene, index, all) => all.findIndex(candidate => candidate.id === scene.id) === index);

export function queueDisplayScene(state: DisplayPlaybackQueue, incoming: DisplayScene): DisplayPlaybackQueue {
  if (!state.current) return { current: incoming, pending: state.pending };
  const active = state.current;
  if (active.id === incoming.id || state.pending.some(scene => scene.id === incoming.id)) return state;

  // Repeating the intervention replaces the previous attempt, never queues it
  // for an unexpected replay after the new Glitch film ends.
  if (incoming.payload.eventKey === "MISSION_BREACH") {
    const previous = [active, ...state.pending].filter(scene => scene.payload.eventKey === "MISSION_BREACH");
    if (previous.some(scene => compareDisplaySceneOrder(incoming, scene) <= 0)) return state;
    const pending = state.pending.filter(scene => scene.payload.eventKey !== "MISSION_BREACH");
    if (active.payload.eventKey === "MISSION_BREACH") return { current: incoming, pending };
    state = { ...state, pending };
  }

  const sameSessionScenes = [active, ...state.pending].filter(scene => sameNexusSession(scene, incoming));
  const newestSameSession = sameSessionScenes.reduce<DisplayScene | undefined>((newest, scene) => !newest || compareDisplaySceneOrder(scene, newest) > 0 ? scene : newest, undefined);
  if (newestSameSession && compareDisplaySceneOrder(incoming, newestSameSession) <= 0) return state;

  const pending = sameSessionScenes.length
    ? state.pending.filter(scene => !sameNexusSession(scene, incoming))
    : state.pending;
  const replacesCurrent = sameNexusSession(active, incoming);
  const interrupts = incoming.interrupt_policy === "force"
    || (incoming.interrupt_policy === "interrupt_lower" && incoming.priority > active.priority);

  if (replacesCurrent) return { current: incoming, pending };
  if (interrupts) return { current: incoming, pending: uniqueScenes([active, ...pending]) };
  return {
    current: active,
    pending: uniqueScenes([...pending, incoming]).sort((left, right) => right.priority - left.priority || Date.parse(left.scheduled_at) - Date.parse(right.scheduled_at)),
  };
}

export function shouldAcceptScene(scene: DisplayScene, deviceId: string, processed: ReadonlySet<string>, now = Date.now()) {
  if (processed.has(scene.id) || (scene.target_device_id && scene.target_device_id !== deviceId)) return false;
  if (["played", "skipped", "expired", "failed", "cancelled"].includes(scene.status)) return false;
  const scheduled = Date.parse(scene.scheduled_at);
  if (!Number.isFinite(scheduled) || scheduled > now + 30_000) return false;
  const maxAge = Math.max(scene.duration_ms ?? 30_000, 60_000);
  return scheduled >= now - maxAge;
}

