import { randomUUID } from "node:crypto";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { validateCheckinPhoto } from "@/lib/checkin/schema";

export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  try {
    const form = await request.formData();
    const eventId = String(form.get("eventId") ?? "");
    const sessionId = String(form.get("sessionId") ?? "");
    const version = Number(form.get("version"));
    const avatarKey = String(form.get("avatarKey") ?? "bolt");
    const consent = form.get("consent") === "true";
    const photoValue = form.get("photo");
    const photo = photoValue instanceof File && photoValue.size > 0 ? photoValue : null;
    if (!eventId || !sessionId || !Number.isInteger(version) || version < 1) return Response.json({ error: "Sesión inválida" }, { status: 400 });
    const photoError = validateCheckinPhoto(photo);
    if (photoError) return Response.json({ error: photoError }, { status: 400 });
    if (photo && !consent) return Response.json({ error: "Un responsable debe autorizar la fotografía" }, { status: 400 });
    const { supabase, event, userId } = await requireAdminEvent(eventId);
    if (photo) {
      uploadedPath = `${event.id}/participants/${randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("event-private").upload(uploadedPath, photo, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
      if (error) throw new AdminApiError(502, "PHOTO_UPLOAD_FAILED", "No se pudo guardar la fotografía");
    }
    const { data, error } = await supabase.rpc("control_reception_session", {
      p_session_id: sessionId, p_expected_version: version, p_action: photo ? "photo" : "avatar",
      p_payload: { photoPath: uploadedPath, photoAllowed: Boolean(photo), avatarKey }, p_actor_user_id: userId,
      p_idempotency_key: `reception-photo:${sessionId}:${randomUUID()}`,
    });
    if (error) throw new AdminApiError(409, "PHOTO_CONFIRM_FAILED", "No se pudo confirmar el avatar");
    return Response.json({ session: data });
  } catch (error) {
    if (uploadedPath) {
      try {
        const { supabase } = await requireAdminEvent(uploadedPath.split("/")[0]);
        await supabase.storage.from("event-private").remove([uploadedPath]);
      } catch { /* private orphan retained for cleanup */ }
    }
    return adminErrorResponse(error);
  }
}
