import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHECKIN_BUCKET,
  CHECKIN_RPC,
  CheckinServerError,
  isMissingCheckinRpc,
  requireCheckinContext,
} from "@/lib/checkin/server";
import { checkinFieldsSchema, validateCheckinPhoto } from "@/lib/checkin/schema";

function formBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null;
  try {
    const form = await request.formData();
    const parsed = checkinFieldsSchema.safeParse({
      eventId: form.get("eventId"),
      participantId: form.get("participantId") || undefined,
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      gamerTag: form.get("gamerTag"),
      avatarKey: form.get("avatarKey") || "bolt",
      photoConsent: formBoolean(form.get("photoConsent")),
      guardianConfirmed: formBoolean(form.get("guardianConfirmed")),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const photoValue = form.get("photo");
    const photo = photoValue instanceof File && photoValue.size > 0 ? photoValue : null;
    const photoError = validateCheckinPhoto(photo);
    if (photoError) return NextResponse.json({ error: photoError, code: "INVALID_PHOTO" }, { status: 400 });
    if (Boolean(photo) !== parsed.data.photoConsent) {
      return NextResponse.json(
        { error: "La fotografía y su autorización deben enviarse juntas", code: "CONSENT_MISMATCH" },
        { status: 400 },
      );
    }

    const { supabase, userId, context } = await requireCheckinContext(parsed.data.eventId);
    if (context.eventId !== parsed.data.eventId) {
      return NextResponse.json({ error: "Evento no autorizado", code: "FORBIDDEN" }, { status: 403 });
    }

    if (photo) {
      uploadedPath = `${context.eventId}/participants/${randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(CHECKIN_BUCKET)
        .upload(uploadedPath, photo, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
      if (uploadError) {
        return NextResponse.json(
          { error: "No se pudo guardar la fotografía privada", code: "PHOTO_UPLOAD_FAILED" },
          { status: 502 },
        );
      }
    }

    const sceneKey = `player-unlocked:${context.eventId}:${parsed.data.participantId ?? randomUUID()}`;
    const { data, error } = await supabase.rpc(CHECKIN_RPC, {
      p_event_id: context.eventId,
      p_participant_id: parsed.data.participantId ?? null,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName ?? null,
      p_gamer_tag: parsed.data.gamerTag ?? null,
      p_avatar_key: parsed.data.avatarKey,
      p_photo_path: uploadedPath,
      p_photo_allowed: parsed.data.photoConsent,
      p_guardian_confirmation: parsed.data.guardianConfirmed ? "confirmed_at_checkin" : null,
      p_auto_welcome: context.autoWelcome,
      p_scene_idempotency_key: sceneKey,
      p_actor_user_id: userId,
    });

    if (error) {
      if (uploadedPath) {
        try {
          await createAdminClient().storage.from(CHECKIN_BUCKET).remove([uploadedPath]);
        } catch {
          // The orphan path is not exposed publicly and can be removed by the media retention job.
        }
        uploadedPath = null;
      }
      if (isMissingCheckinRpc(error.message)) {
        return NextResponse.json(
          {
            error: "El backend de check-in todavía no fue migrado",
            code: "RPC_UNAVAILABLE",
            requiredRpc: CHECKIN_RPC,
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "No se pudo confirmar el registro", code: "CHECKIN_FAILED" }, { status: 409 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(
      { participant: result, sceneQueued: context.autoWelcome },
      { status: parsed.data.participantId ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof CheckinServerError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "NOT_CONFIGURED" ? 503 : 403;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (uploadedPath) {
      try {
        await createAdminClient().storage.from(CHECKIN_BUCKET).remove([uploadedPath]);
      } catch {
        // Private orphan; retained for server-side cleanup.
      }
    }
    return NextResponse.json({ error: "Error inesperado durante el check-in", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
