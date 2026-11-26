import { NextRequest } from "next/server";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";

const noStore = { "cache-control": "no-store" };

type PlaybackLog = { status: string; occurred_at: string };
type PauseEvent = { action: string; created_at: string };

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const durationFromMetadata = (value: unknown) => {
  const duration = Number(record(value).durationMs);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId") ?? undefined;
    const { supabase, event } = await requireAdminEvent(eventId);
    const { data: session, error: sessionError } = await supabase.from("reception_sessions")
      .select("id,status,updated_at").eq("event_id", event.id).in("status", ["active", "paused"])
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (sessionError) throw new AdminApiError(500, "PLAYBACK_READ_FAILED", "No se pudo consultar la reproducción");
    if (!session) return Response.json({ playback: null, serverTime: new Date().toISOString() }, { headers: noStore });

    const { data: scene, error: sceneError } = await supabase.from("scene_events")
      .select("id,scene_type,payload,sound,status,duration_ms,created_at")
      .eq("event_id", event.id).contains("payload", { sessionId: session.id })
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sceneError) throw new AdminApiError(500, "PLAYBACK_READ_FAILED", "No se pudo consultar la escena activa");
    if (!scene) return Response.json({ playback: null, serverTime: new Date().toISOString() }, { headers: noStore });

    const { data: logs, error: logsError } = await supabase.from("scene_playback_logs")
      .select("status,occurred_at").eq("scene_event_id", scene.id).order("occurred_at", { ascending: true });
    if (logsError) throw new AdminApiError(500, "PLAYBACK_READ_FAILED", "No se pudo consultar el inicio de reproducción");
    const playbackLogs = (logs ?? []) as unknown as PlaybackLog[];
    const startedAt = playbackLogs.find((item) => item.status === "started")?.occurred_at ?? null;

    const payload = record(scene.payload);
    const sound = record(scene.sound);
    const paths = [payload.videoPath, sound.path].filter((value): value is string => typeof value === "string" && value.length > 0);
    const { data: assets, error: assetsError } = paths.length
      ? await supabase.from("media_assets").select("storage_path,metadata").eq("event_id", event.id).in("storage_path", paths)
      : { data: [] as { storage_path: string; metadata: unknown }[], error: null };
    if (assetsError) throw new AdminApiError(500, "PLAYBACK_READ_FAILED", "No se pudo consultar la duración del recurso");
    const durations = new Map((assets ?? []).map((asset) => [asset.storage_path, durationFromMetadata(asset.metadata)]));
    const videoDuration = typeof payload.videoPath === "string" ? durations.get(payload.videoPath) ?? 0 : 0;
    const audioDuration = typeof sound.path === "string" ? (durations.get(sound.path) ?? 0) + Math.max(0, Number(sound.cueMs) || 0) : 0;
    const mediaDuration = Math.max(videoDuration, audioDuration);
    const durationMs = payload.videoLoop === true ? null : mediaDuration || scene.duration_ms || null;

    let pausedMs = 0;
    let pausedAt: string | null = null;
    if (startedAt) {
      const { data: events, error: eventsError } = await supabase.from("reception_session_events")
        .select("action,created_at").eq("session_id", session.id).in("action", ["pause", "resume"])
        .gte("created_at", startedAt).order("created_at", { ascending: true });
      if (eventsError) throw new AdminApiError(500, "PLAYBACK_READ_FAILED", "No se pudo consultar las pausas");
      for (const item of (events ?? []) as unknown as PauseEvent[]) {
        if (item.action === "pause" && !pausedAt) pausedAt = item.created_at;
        if (item.action === "resume" && pausedAt) {
          pausedMs += Math.max(0, Date.parse(item.created_at) - Date.parse(pausedAt));
          pausedAt = null;
        }
      }
      if (session.status === "paused" && !pausedAt) pausedAt = session.updated_at;
      if (session.status === "active") pausedAt = null;
    }

    return Response.json({
      playback: {
        sceneId: scene.id,
        sceneKey: String(payload.state ?? scene.scene_type.replace(/^NEXUS_/, "")),
        status: scene.status,
        durationMs,
        startedAt,
        pausedMs,
        pausedAt,
      },
      serverTime: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
