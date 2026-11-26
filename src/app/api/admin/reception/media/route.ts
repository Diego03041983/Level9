import { z } from "zod";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { receptionMediaSchema } from "@/lib/reception/schemas";

const VIDEO_MAX = 100 * 1024 * 1024;
const AUDIO_MAX = 20 * 1024 * 1024;
const uploadSchema = receptionMediaSchema.extend({ storagePath: z.string().min(1).max(300) });

export async function POST(request: Request) {
  let uploadedPath: string | undefined;
  let createdAssetId: string | undefined;
  try {
    const parsed = uploadSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Configuración inválida" }, { status: 400 });

    const { supabase, event, userId } = await requireAdminEvent(parsed.data.eventId);
    const participantId = parsed.data.participantId || null;
    if (parsed.data.sceneKey === "IDENTITY_REVEAL" && parsed.data.mediaKind === "audio" && !participantId) {
      return Response.json({ error: "El audio de identidad debe asociarse a un jugador" }, { status: 400 });
    }
    if (participantId) {
      const { data: participant } = await supabase.from("participants").select("id").eq("id", participantId).eq("event_id", event.id).maybeSingle();
      if (!participant) throw new AdminApiError(404, "PARTICIPANT_NOT_FOUND", "El invitado no pertenece al evento");
    }

    // The browser sends the bytes straight to Storage. Only a fresh object in this
    // event/scene folder can be attached to the scene by this small JSON request.
    const isVideo = parsed.data.mediaKind === "video";
    const prefix = `${event.id}/reception/${participantId ?? "generic"}/${parsed.data.sceneKey.toLowerCase()}/`;
    const suffix = isVideo ? "mp4" : "(?:wav|mp3)";
    const namePattern = new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${suffix}$`, "i");
    if (!parsed.data.storagePath.startsWith(prefix) || !namePattern.test(parsed.data.storagePath.slice(prefix.length))) {
      throw new AdminApiError(400, "INVALID_PATH", "La ruta del archivo no corresponde a la escena");
    }
    const { data: file, error: infoError } = await supabase.storage.from("event-media").info(parsed.data.storagePath);
    if (infoError || !file) throw new AdminApiError(404, "FILE_MISSING", "No se encontró el archivo cargado");
    const mimeType = file.contentType ?? file.metadata?.mimetype;
    const size = Number(file.size ?? file.metadata?.size);
    const validType = typeof mimeType === "string" && (isVideo ? mimeType === "video/mp4" : ["audio/wav", "audio/x-wav", "audio/mpeg"].includes(mimeType));
    if (!validType || !Number.isFinite(size) || size <= 0 || size > (isVideo ? VIDEO_MAX : AUDIO_MAX)) {
      throw new AdminApiError(400, "INVALID_FILE", "El archivo no tiene un formato o tamaño permitido");
    }
    uploadedPath = parsed.data.storagePath;

    let previousQuery = supabase.from("reception_media_assignments")
      .select("id,media_asset_id,media_assets(storage_path)").eq("event_id", event.id)
      .eq("scene_key", parsed.data.sceneKey).eq("media_kind", parsed.data.mediaKind);
    previousQuery = participantId ? previousQuery.eq("participant_id", participantId) : previousQuery.is("participant_id", null);
    const { data: previous } = await previousQuery.maybeSingle();
    const { data: asset, error: assetError } = await supabase.from("media_assets").insert({
      event_id: event.id, name: `nexus-${parsed.data.sceneKey.toLowerCase()}-${parsed.data.mediaKind}`,
      asset_type: isVideo ? "video" : "audio", storage_path: uploadedPath, mime_type: mimeType,
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
