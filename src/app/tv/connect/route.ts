import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const noStore = { "Cache-Control": "no-store, private" };
const denied = () => NextResponse.json({ error: "DISPLAY_SESSION_INVALID" }, { status: 401, headers: noStore });

type SceneRecord = { scene_type: string; payload: unknown; sound?: unknown; [key: string]: unknown };

async function signedPhotoUrl(supabase: ReturnType<typeof createAdminClient>, path: unknown) {
  if (typeof path !== "string" || !path) return undefined;
  const { data, error } = await supabase.storage.from("event-private").createSignedUrl(path, 300);
  return error ? undefined : data.signedUrl;
}

async function signedEventMediaUrl(supabase: ReturnType<typeof createAdminClient>, path: unknown) {
  if (typeof path !== "string" || !path) return undefined;
  const { data, error } = await supabase.storage.from("event-media").createSignedUrl(path, 900);
  return error ? undefined : data.signedUrl;
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

  if (raw.videoPath) payload.videoUrl = await signedEventMediaUrl(supabase, raw.videoPath);
  if (raw.photoPath) payload.photoUrl = await signedPhotoUrl(supabase, raw.photoPath);
  if (rawSound.path) sound.url = await signedEventMediaUrl(supabase, rawSound.path);

  if (["PLAYER_UNLOCKED", "PLAYER_WELCOME"].includes(scene.scene_type.toUpperCase()) && !payload.player) {
    payload.player = {
      name: typeof raw.firstName === "string" ? raw.firstName : "Jugador",
      gamerTag: typeof raw.gamerTag === "string" ? raw.gamerTag : undefined,
      number: typeof raw.playerNumber === "number" ? raw.playerNumber : undefined,
      photoUrl: await signedPhotoUrl(supabase, raw.photoPath),
    };
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
  return { ...scene, payload, sound };
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
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await authenticated.supabase.from("scene_events").select("*")
      .eq("event_id", requestedEvent).in("status", ["queued", "delivered", "playing"])
      .gte("created_at", cutoff).lte("scheduled_at", new Date(Date.now() + 30_000).toISOString())
      .order("priority", { ascending: false }).order("scheduled_at", { ascending: true }).limit(30);
    if (error) throw error;
    const visibleScenes = (data ?? []).filter((scene) => !scene.target_device_id || scene.target_device_id === authenticated.device.id);
    const scenes = await Promise.all(visibleScenes.map((scene) => hydratePrivateMedia(authenticated.supabase, scene as SceneRecord)));
    await Promise.all([
      authenticated.supabase.from("display_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", authenticated.device.id),
      authenticated.supabase.from("display_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", authenticated.session.id),
    ]);
    return NextResponse.json({ eventId: requestedEvent, deviceId: authenticated.device.id, scenes }, { headers: noStore });
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
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    console.error("TV acknowledgement failed", error);
    return NextResponse.json({ error: "DISPLAY_ACK_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}
