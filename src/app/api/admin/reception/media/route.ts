import { randomUUID } from "node:crypto";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { receptionMediaSchema } from "@/lib/reception/schemas";

const VIDEO_MAX = 100 * 1024 * 1024;
const AUDIO_MAX = 20 * 1024 * 1024;

export async function POST(request: Request) {
  let uploadedPath: string | undefined;
  let createdAssetId: string | undefined;
  try {
    const form = await request.formData();
    const parsed = receptionMediaSchema.safeParse({
      eventId: form.get("eventId"), participantId: form.get("participantId") ?? "",
      sceneKey: form.get("sceneKey"), mediaKind: form.get("mediaKind"), cueMs: form.get("cueMs") ?? "0",
      loop: form.get("loop") ?? "false", volume: form.get("volume") ?? "1", durationMs: form.get("durationMs") ?? "0",
    });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Configuración inválida" }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Seleccioná un archivo" }, { status: 400 });
    const isVideo = parsed.data.mediaKind === "video";
    const allowed = isVideo ? file.type === "video/mp4" : ["audio/wav", "audio/x-wav", "audio/mpeg"].includes(file.type);
    if (!allowed) return Response.json({ error: isVideo ? "El video debe ser MP4" : "El audio debe ser WAV o MP3" }, { status: 400 });
    if (file.size > (isVideo ? VIDEO_MAX : AUDIO_MAX)) return Response.json({ error: "El archivo supera el límite permitido" }, { status: 413 });

    const { supabase, event, userId } = await requireAdminEvent(parsed.data.eventId);
    const participantId = parsed.data.participantId || null;
    if (participantId) {
      const { data: participant } = await supabase.from("participants").select("id").eq("id", participantId).eq("event_id", event.id).maybeSingle();
      if (!participant) throw new AdminApiError(404, "PARTICIPANT_NOT_FOUND", "El invitado no pertenece al evento");
    }
    const ext = isVideo ? "mp4" : file.type === "audio/mpeg" ? "mp3" : "wav";
    uploadedPath = `${event.id}/reception/${participantId ?? "generic"}/${parsed.data.sceneKey.toLowerCase()}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("event-media").upload(uploadedPath, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
    if (uploadError) throw new AdminApiError(502, "UPLOAD_FAILED", "No se pudo cargar el archivo");

    let previousQuery = supabase.from("reception_media_assignments")
      .select("id,media_asset_id,media_assets(storage_path)").eq("event_id", event.id)
      .eq("scene_key", parsed.data.sceneKey).eq("media_kind", parsed.data.mediaKind);
    previousQuery = participantId ? previousQuery.eq("participant_id", participantId) : previousQuery.is("participant_id", null);
    const { data: previous } = await previousQuery.maybeSingle();
    const { data: asset, error: assetError } = await supabase.from("media_assets").insert({
      event_id: event.id, name: `nexus-${parsed.data.sceneKey.toLowerCase()}-${parsed.data.mediaKind}`,
      asset_type: isVideo ? "video" : "audio", storage_path: uploadedPath, mime_type: file.type,
      metadata: { durationMs: parsed.data.durationMs, source: "nexus-reception" }, created_by: userId,
    }).select("id").single();
    if (assetError || !asset) throw new AdminApiError(409, "ASSET_FAILED", "No se pudo registrar el recurso");
    createdAssetId = asset.id;
    const assignment = {
      event_id: event.id, participant_id: participantId, scene_key: parsed.data.sceneKey,
      media_kind: parsed.data.mediaKind, media_asset_id: asset.id, cue_ms: parsed.data.cueMs,
      loop: parsed.data.loop, volume: parsed.data.volume,
    };
    let assignmentError;
    if (previous?.id) {
      assignmentError = (await supabase.from("reception_media_assignments").update(assignment).eq("id", previous.id)).error;
    } else {
      assignmentError = (await supabase.from("reception_media_assignments").insert(assignment)).error;
    }
    if (assignmentError) throw new AdminApiError(409, "ASSIGNMENT_FAILED", "No se pudo asociar el archivo");
    createdAssetId = undefined;

    if (previous?.media_asset_id) {
      const relation = previous.media_assets as unknown as { storage_path?: string } | { storage_path?: string }[] | null;
      const oldPath = Array.isArray(relation) ? relation[0]?.storage_path : relation?.storage_path;
      if (oldPath) await supabase.storage.from("event-media").remove([oldPath]);
      await supabase.from("media_assets").delete().eq("id", previous.media_asset_id);
    }
    const { data: signed } = await supabase.storage.from("event-media").createSignedUrl(uploadedPath, 3600);
    return Response.json({ ok: true, previewUrl: signed?.signedUrl }, { status: 201 });
  } catch (error) {
    if (uploadedPath) {
      try {
        const formEventId = uploadedPath.split("/")[0];
        const { supabase } = await requireAdminEvent(formEventId);
        await supabase.storage.from("event-media").remove([uploadedPath]);
        if (createdAssetId) await supabase.from("media_assets").delete().eq("id", createdAssetId);
      } catch { /* private orphan can be removed by retention cleanup */ }
    }
    return adminErrorResponse(error);
  }
}

