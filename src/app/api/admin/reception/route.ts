import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { receptionOperationSchema } from "@/lib/reception/schemas";

const noStore = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId") ?? undefined;
    const { supabase, event } = await requireAdminEvent(eventId);
    const [participantsResult, sessionsResult, devicesResult, assignmentsResult] = await Promise.all([
      supabase.from("participants").select("id,first_name,last_name,gamer_tag,player_number,avatar_key,photo_path,is_celebrant,administrative_status,operational_status,registration_status,arrived_at,activated_at").eq("event_id", event.id).order("player_number"),
      supabase.from("reception_sessions").select("id,event_id,participant_id,display_device_id,protocol_mode,protocol_state,status,version,started_at,completed_at,updated_at").eq("event_id", event.id).order("started_at", { ascending: false }).limit(100),
      supabase.from("display_devices").select("id,name,last_seen_at,revoked_at,audio_enabled").eq("event_id", event.id).is("revoked_at", null).order("created_at"),
      supabase.from("reception_media_assignments").select("id,event_id,participant_id,scene_key,media_kind,media_asset_id,cue_ms,loop,volume,media_assets(id,name,storage_path,mime_type,metadata)").eq("event_id", event.id).order("scene_key"),
    ]);
    const failure = [participantsResult.error, sessionsResult.error, devicesResult.error, assignmentsResult.error].find(Boolean);
    if (failure) throw new AdminApiError(500, "READ_FAILED", "No se pudo cargar la recepción NEXUS");

    type Assignment = { media_assets?: { storage_path?: string } | { storage_path?: string }[] | null; [key: string]: unknown };
    const assignments = (assignmentsResult.data ?? []) as unknown as Assignment[];
    const paths = assignments.flatMap((item) => {
      const asset = Array.isArray(item.media_assets) ? item.media_assets[0] : item.media_assets;
      return typeof asset?.storage_path === "string" ? [asset.storage_path] : [];
    });
    const signed = paths.length ? await supabase.storage.from("event-media").createSignedUrls(paths, 3600) : { data: [] };
    const signedByPath = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));
    const media = assignments.map((item) => {
      const asset = Array.isArray(item.media_assets) ? item.media_assets[0] : item.media_assets;
      return { ...item, previewUrl: asset?.storage_path ? signedByPath.get(asset.storage_path) : undefined };
    });
    return Response.json({ event, participants: participantsResult.data ?? [], sessions: sessionsResult.data ?? [], devices: devicesResult.data ?? [], media }, { headers: noStore });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const parsed = receptionOperationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos", code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event, userId } = await requireAdminEvent(parsed.data.eventId);
    const operation = parsed.data;

    if (operation.operation === "createGuest" || operation.operation === "importGuests") {
      const guests = operation.operation === "createGuest" ? [operation.guest] : operation.guests;
      const { data, error } = await supabase.rpc("import_reception_guests", { p_event_id: event.id, p_guests: guests, p_actor_user_id: userId });
      if (error) throw new AdminApiError(409, "IMPORT_FAILED", error.message.includes("function") ? "Falta aplicar la migración NEXUS" : "Revisá los datos de los invitados");
      return Response.json({ imported: data }, { status: 201 });
    }

    if (operation.operation === "updateGuest") {
      const { data, error } = await supabase.from("participants").update({
        first_name: operation.guest.firstName, last_name: operation.guest.lastName || null,
        is_celebrant: operation.guest.isCelebrant, avatar_key: operation.guest.avatarKey,
      }).eq("id", operation.participantId).eq("event_id", event.id)
        .select("id,first_name,last_name,is_celebrant,avatar_key").single();
      if (error) throw new AdminApiError(409, "UPDATE_FAILED", "No se pudo actualizar el invitado");
      return Response.json({ participant: data });
    }

    if (operation.operation === "cancelGuest") {
      const { error } = await supabase.from("participants").update({ registration_status: "CANCELLED", administrative_status: "inactive", operational_status: "unavailable" })
        .eq("id", operation.participantId).eq("event_id", event.id);
      if (error) throw new AdminApiError(409, "CANCEL_FAILED", "No se pudo cancelar el invitado");
      return Response.json({ ok: true });
    }

    if (operation.operation === "start") {
      const key = `reception-start:${operation.participantId}:${randomUUID()}`;
      const { data, error } = await supabase.rpc("start_reception_session", {
        p_event_id: event.id, p_participant_id: operation.participantId,
        p_display_device_id: operation.displayDeviceId, p_mode: operation.mode,
        p_actor_user_id: userId, p_idempotency_key: key,
      });
      if (error) throw new AdminApiError(409, "START_FAILED", error.message.includes("unique") ? "Ya existe un protocolo activo para ese jugador o televisor" : "No se pudo iniciar el protocolo");
      return Response.json({ session: data }, { status: 201 });
    }

    const { data, error } = await supabase.rpc("control_reception_session", {
      p_session_id: operation.sessionId, p_expected_version: operation.expectedVersion,
      p_action: operation.action, p_payload: operation.payload, p_actor_user_id: userId,
      p_idempotency_key: `reception:${operation.sessionId}:${operation.action}:${randomUUID()}`,
    });
    if (error) {
      const message = error.code === "40001" ? "La sesión cambió; actualizando…"
        : error.code === "23505" ? "Ese nickname ya está utilizado"
        : "No se pudo aplicar la acción";
      throw new AdminApiError(409, "CONTROL_FAILED", message);
    }
    return Response.json({ session: data });
  } catch (error) { return adminErrorResponse(error); }
}

