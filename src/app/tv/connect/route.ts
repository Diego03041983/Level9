import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {dispatchAudiovisualEvent} from "@/lib/audiovisual/dispatch";
import {resolveMissionFinaleVideo} from "@/lib/tv/mission-finale";

const noStore = { "Cache-Control": "no-store, private" };
const denied = () => NextResponse.json({ error: "DISPLAY_SESSION_INVALID" }, { status: 401, headers: noStore });
// Signing the same currently playing clip at every recovery is expensive.
// Entries are used only after session authentication; URLs outlive the cache.
const mediaUrls = new Map<string, { expires: number; url: string }>();

type SceneRecord = { scene_type: string; payload: unknown; sound?: unknown; [key: string]: unknown };

async function signedPhotoUrl(supabase: ReturnType<typeof createAdminClient>, path: unknown) {
  if (typeof path !== "string" || !path) return undefined;
  const { data, error } = await supabase.storage.from("event-private").createSignedUrl(path, 300);
  return error ? undefined : data.signedUrl;
}

async function signedEventMediaUrl(supabase: ReturnType<typeof createAdminClient>, path: unknown) {
  if (typeof path !== "string" || !path) return undefined;
  const cached = mediaUrls.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from("event-media").createSignedUrl(path, 900);
  if (error) return undefined;
  if (mediaUrls.size >= 300) mediaUrls.clear();
  mediaUrls.set(path, { url: data.signedUrl, expires: Date.now() + 300_000 });
  return data.signedUrl;
}

async function hydratePrivateMedia(supabase: ReturnType<typeof createAdminClient>, scene: SceneRecord) {
  const raw = scene.payload && typeof scene.payload === "object" && !Array.isArray(scene.payload)
    ? scene.payload as Record<string, unknown>
    : {};
  const payload = { ...raw };
  const rawSound = scene.sound && typeof scene.sound === "object" && !Array.isArray(scene.sound)
    ? scene.sound as Record<string, unknown>
    : {};
  const sound = { ...rawSound };
  let videoPath = raw.videoPath;
  let durationMs = scene.duration_ms;
  if (scene.scene_type === "GLITCH_DEFEATED" && typeof scene.event_id === "string") {
    const finalVideo = await resolveMissionFinaleVideo(supabase,scene.event_id);
    if (finalVideo) {
      videoPath = finalVideo.path;
      if (finalVideo.durationMs) durationMs = finalVideo.durationMs;
      payload.videoLoop = false;
    }
  }

  const [videoUrl, photoUrl, audioUrl, analysisUrl] = await Promise.all([
    signedEventMediaUrl(supabase, videoPath), signedPhotoUrl(supabase, raw.photoPath), signedEventMediaUrl(supabase, rawSound.path),
    signedEventMediaUrl(supabase, rawSound.analysisPath),
  ]);
  if (videoPath) payload.videoUrl = videoUrl;
  if (raw.photoPath) payload.photoUrl = photoUrl;
  if (rawSound.path) sound.url = audioUrl;
  if (rawSound.analysisPath) sound.analysisUrl = analysisUrl;
  if (Array.isArray(rawSound.sequence)) {
    sound.sequence = await Promise.all(rawSound.sequence.map(async (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const segment = value as Record<string, unknown>;
      if (segment.kind !== "audio" || typeof segment.path !== "string") return segment;
      const url = await signedEventMediaUrl(supabase, segment.path);
      const hydrated: Record<string, unknown> = { ...segment, url };
      delete hydrated.path;
      return hydrated;
    }));
  }

  if (["PLAYER_UNLOCKED", "PLAYER_WELCOME"].includes(scene.scene_type.toUpperCase()) && !payload.player) {
    payload.player = {
      name: typeof raw.firstName === "string" ? raw.firstName : "Jugador",
      gamerTag: typeof raw.gamerTag === "string" ? raw.gamerTag : undefined,
      number: typeof raw.playerNumber === "number" ? raw.playerNumber : undefined,
      photoUrl: await signedPhotoUrl(supabase, raw.photoPath),
    };
  }

  if (raw.player && typeof raw.player === "object" && !Array.isArray(raw.player)) {
    const player = raw.player as Record<string, unknown>;
    payload.player = { ...player, photoUrl: await signedPhotoUrl(supabase, player.photoPath) };
  }
  if (raw.winner && typeof raw.winner === "object" && !Array.isArray(raw.winner)) {
    const winner = raw.winner as Record<string, unknown>;
    payload.winner = { ...winner, photoUrl: await signedPhotoUrl(supabase, winner.photoPath) };
  }

  if (Array.isArray(raw.players)) {
    payload.players = await Promise.all(raw.players.map(async (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const player = value as Record<string, unknown>;
      return { ...player, photoUrl: await signedPhotoUrl(supabase, player.photoPath) };
    }));
  }

  delete payload.videoPath;
  delete payload.photoPath;
  delete sound.path;
  delete sound.analysisPath;
  return { ...scene, duration_ms: durationMs, payload, sound };
}

async function authenticate(request: NextRequest) {
  const deviceId = request.headers.get("x-display-device") ?? "";
  const token = request.headers.get("x-display-session") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || token.length < 32 || token.length > 512) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = createAdminClient();
  const { data: session } = await supabase.from("display_sessions").select("id, device_id, expires_at, revoked_at").eq("device_id", deviceId).eq("token_hash", tokenHash).maybeSingle();
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  const { data: device } = await supabase.from("display_devices").select("id, event_id, revoked_at").eq("id", deviceId).maybeSingle();
  if (!device || device.revoked_at) return null;
  return { supabase, session, device, token };
}

export async function GET(request: NextRequest) {
  try {
    const authenticated = await authenticate(request);
    if (!authenticated) return denied();
    const requestedEvent = request.nextUrl.searchParams.get("eventId");
    if (requestedEvent !== authenticated.device.event_id) return denied();
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data, error } = await authenticated.supabase.from("scene_events").select("*")
      .eq("event_id", requestedEvent).in("status", ["queued", "delivered", "playing"])
      .gte("created_at", staleCutoff).lte("scheduled_at", new Date(Date.now() + 30_000).toISOString())
      .order("priority", { ascending: false }).order("scheduled_at", { ascending: true }).limit(30);
    if (error) throw error;
    const deviceScenes = (data ?? []).filter((scene) => !scene.target_device_id || scene.target_device_id === authenticated.device.id);
    const receptionSessionIds = [...new Set(deviceScenes.flatMap((scene) => {
      if (!scene.scene_type.toUpperCase().startsWith("NEXUS_")) return [];
      const payload = scene.payload && typeof scene.payload === "object" && !Array.isArray(scene.payload) ? scene.payload as Record<string, unknown> : {};
      return typeof payload.sessionId === "string" ? [payload.sessionId] : [];
    }))];
    const { data: liveReceptionSessions } = receptionSessionIds.length
      ? await authenticated.supabase.from("reception_sessions").select("id").in("id", receptionSessionIds).in("status", ["active", "paused"])
      : { data: [] as { id: string }[] };
    const liveSessionIds = new Set((liveReceptionSessions ?? []).map((session) => session.id));
    const visibleScenes = deviceScenes.filter((scene) => {
      if (!scene.scene_type.toUpperCase().startsWith("NEXUS_")) return true;
      const payload = scene.payload && typeof scene.payload === "object" && !Array.isArray(scene.payload) ? scene.payload as Record<string, unknown> : {};
      // Nexus scenes created by reception belong to a live reception session.
      // Narrative Nexus/Glitch scenes have no sessionId and must remain visible.
      return typeof payload.sessionId !== "string" || liveSessionIds.has(payload.sessionId);
    });
    const scenes = await Promise.all(visibleScenes.map((scene) => hydratePrivateMedia(authenticated.supabase, scene as SceneRecord)));
    // Heartbeats handle presence every 15s; recovery should be read-only and fast.
    const {data:mission}=await authenticated.supabase.from("missions").select("id,name,duration_seconds,status,started_at,paused_at,paused_seconds,extension_seconds,unlocked_at,completed_at").eq("event_id",requestedEvent).order("created_at",{ascending:false}).limit(1).maybeSingle();
    const {data:digits}=mission?await authenticated.supabase.from("mission_digit_slots").select("slot,digit").eq("mission_id",mission.id).order("slot"):{data:[]};
    return NextResponse.json({ eventId: requestedEvent, deviceId: authenticated.device.id, scenes, mission:mission?{...mission,digits}:null }, { headers: noStore });
  } catch (error) {
    console.error("TV state recovery failed", error);
    return NextResponse.json({ error: "DISPLAY_STATE_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authenticated = await authenticate(request);
    if (!authenticated) return denied();
    const body = await request.json() as { action?: string; sceneId?: string; status?: string; audioEnabled?: boolean; error?: string };
    const now = new Date().toISOString();
    if (body.action === "heartbeat") {
      await Promise.all([
        authenticated.supabase.from("display_devices").update({ last_seen_at: now, audio_enabled: body.audioEnabled === true }).eq("id", authenticated.device.id),
        authenticated.supabase.from("display_sessions").update({ last_seen_at: now }).eq("id", authenticated.session.id),
      ]);
      return NextResponse.json({ ok: true, serverTime: now }, { headers: noStore });
    }
    const statuses = new Set(["received", "started", "completed", "failed", "skipped"]);
    if (body.action !== "ack" || !body.sceneId || !statuses.has(body.status ?? "")) {
      return NextResponse.json({ error: "INVALID_ACK" }, { status: 400, headers: noStore });
    }
    const { error } = await authenticated.supabase.rpc("ack_display_scene", {
      p_device_id: authenticated.device.id,
      p_session_token: authenticated.token,
      p_scene_id: body.sceneId,
      p_status: body.status,
      p_error_message: typeof body.error === "string" ? body.error.slice(0, 500) : null,
    });
    if (error) throw error;
    if(body.status==="completed"){
      const {data:scene}=await authenticated.supabase.from("scene_events").select("event_id,payload,scene_type,created_by").eq("id",body.sceneId).eq("event_id",authenticated.device.event_id).maybeSingle();
      const payload=scene?.payload&&typeof scene.payload==="object"&&!Array.isArray(scene.payload)?scene.payload as Record<string,unknown>:{};
      if(payload.eventKey==="MISSION_STARTED"){
        await authenticated.supabase.from("missions").update({status:"live",started_at:now,paused_at:null}).eq("event_id",authenticated.device.event_id).eq("status","ready");
      }
      if(scene?.scene_type==="GLITCH_DEFEATED"&&typeof payload.missionId==="string"&&scene.created_by){
        const key=`mission:${payload.missionId}:restored`;
        const{data:previous}=await authenticated.supabase.from("audiovisual_events").select("id").eq("event_id",authenticated.device.event_id).eq("idempotency_key",key).maybeSingle();
        if(!previous)await dispatchAudiovisualEvent(authenticated.supabase,{eventId:authenticated.device.event_id,eventKey:"NEXUS_RESTORED",context:{participantIds:[],title:"NEXUS RESTAURADO"},rehearsal:false,confirm:true,idempotencyKey:key,userId:scene.created_by});
      }
      if(payload.eventKey==="NEXUS_RESTORED"){
        await authenticated.supabase.from("missions").update({status:"finished"}).eq("event_id",authenticated.device.event_id).eq("status","unlocked");
      }
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    console.error("TV acknowledgement failed", error);
    return NextResponse.json({ error: "DISPLAY_ACK_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}
