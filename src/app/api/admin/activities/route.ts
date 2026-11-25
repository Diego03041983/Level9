import { NextRequest } from "next/server";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { activityDeleteSchema, activityPatchSchema, activityPostSchema } from "@/lib/admin/operations-schemas";
import { eventIdSchema } from "@/lib/admin/schemas";

export async function GET(request: NextRequest) {
  try {
    const rawEventId = request.nextUrl.searchParams.get("eventId");
    const requested = rawEventId ? eventIdSchema.parse(rawEventId) : undefined;
    const { supabase, event } = await requireAdminEvent(requested);
    const [activities, stations, participants, preferences, assignments] = await Promise.all([
      supabase.from("activities").select("id,slug,name,activity_type,status,enabled,rules").eq("event_id", event.id).order("name"),
      supabase.from("stations").select("id,code,name,station_type,capacity,status").eq("event_id", event.id).order("name"),
      supabase.from("participants").select("id,first_name,last_name,gamer_tag,player_number,operational_status")
        .eq("event_id", event.id).eq("administrative_status", "active").order("player_number"),
      supabase.from("participant_activity_preferences").select("participant_id,activity_id,enabled"),
      supabase.from("station_assignments").select("id,station_id,participant_id,status,context_type,starts_at")
        .eq("event_id", event.id).in("status", ["reserved", "active"]),
    ]);
    const failed = [activities, stations, participants, preferences, assignments].find((result) => result.error);
    if (failed?.error) throw new AdminApiError(500, "READ_FAILED", "No se pudo cargar la operación de actividades");
    return Response.json({ event, activities: activities.data, stations: stations.data, participants: participants.data,
      preferences: preferences.data, assignments: assignments.data }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = activityPostSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    if (parsed.data.operation === "createActivity") {
      const { data, error } = await supabase.from("activities").insert({ event_id: event.id, name: parsed.data.name,
        slug: parsed.data.slug, activity_type: parsed.data.activityType, rules: parsed.data.rules })
        .select("id,slug,name,activity_type,status,enabled,rules").single();
      if (error) throw new AdminApiError(409, "CREATE_FAILED", "No se pudo crear la actividad; revisá nombre y código");
      return Response.json({ activity: data }, { status: 201 });
    }
    if (parsed.data.operation === "createStation") {
      const { data, error } = await supabase.from("stations").insert({ event_id: event.id, name: parsed.data.name,
        code: parsed.data.code, station_type: parsed.data.stationType, capacity: parsed.data.capacity })
        .select("id,code,name,station_type,capacity,status").single();
      if (error) throw new AdminApiError(409, "CREATE_FAILED", "No se pudo crear la estación; revisá el código");
      return Response.json({ station: data }, { status: 201 });
    }
    const { data, error } = await supabase.rpc("reserve_station", { target_event: event.id,
      target_station: parsed.data.stationId, participant_ids: parsed.data.participantIds,
      assignment_context_type: parsed.data.contextType, assignment_context_id: parsed.data.contextId ?? null });
    if (error) throw new AdminApiError(409, "RESERVATION_FAILED", "La estación o uno de los jugadores ya está ocupado");
    return Response.json({ assignments: data }, { status: 201 });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = activityPatchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    if (parsed.data.operation === "updateActivity") {
      const { data, error } = await supabase.from("activities").update({ name: parsed.data.name, status: parsed.data.status,
        enabled: parsed.data.enabled, rules: parsed.data.rules }).eq("id", parsed.data.activityId).eq("event_id", event.id)
        .select("id,slug,name,activity_type,status,enabled,rules").single();
      if (error) throw new AdminApiError(409, "UPDATE_FAILED", "No se pudo actualizar la actividad");
      return Response.json({ activity: data });
    }
    if (parsed.data.operation === "stationStatus") {
      if (["available", "paused", "out_of_service"].includes(parsed.data.status)) {
        const { count } = await supabase.from("station_assignments").select("id", { count: "exact", head: true })
          .eq("station_id", parsed.data.stationId).in("status", ["reserved", "active"]);
        if ((count ?? 0) > 0) throw new AdminApiError(409, "ACTIVE_ASSIGNMENT", "Liberá primero la reserva activa");
      }
      const { data, error } = await supabase.from("stations").update({ status: parsed.data.status })
        .eq("id", parsed.data.stationId).eq("event_id", event.id).select("id,status").single();
      if (error) throw new AdminApiError(409, "UPDATE_FAILED", "No se pudo cambiar la estación");
      return Response.json({ station: data });
    }
    if (parsed.data.operation === "preference") {
      const [{ data: participant }, { data: activity }] = await Promise.all([
        supabase.from("participants").select("id").eq("id", parsed.data.participantId).eq("event_id", event.id).maybeSingle(),
        supabase.from("activities").select("id").eq("id", parsed.data.activityId).eq("event_id", event.id).maybeSingle(),
      ]);
      if (!participant || !activity) throw new AdminApiError(404, "NOT_FOUND", "Jugador o actividad inexistente");
      const { error } = await supabase.from("participant_activity_preferences").upsert({ participant_id: participant.id,
        activity_id: activity.id, enabled: parsed.data.enabled }, { onConflict: "participant_id,activity_id" });
      if (error) throw new AdminApiError(409, "UPDATE_FAILED", "No se pudo actualizar la habilitación");
      return Response.json({ ok: true });
    }
    const { data, error } = await supabase.rpc("release_station_reservation", { p_event_id: event.id,
      p_station_id: parsed.data.stationId, p_assignment_status: parsed.data.resolution });
    if (error) throw new AdminApiError(409, "RELEASE_FAILED", "No se pudo liberar la estación");
    return Response.json({ released: data });
  } catch (error) { return adminErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const parsed = activityDeleteSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    const table = parsed.data.resource === "activity" ? "activities" : "stations";
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("id", parsed.data.id).eq("event_id", event.id);
    if (error) throw new AdminApiError(409, "DELETE_FAILED", "El recurso tiene historial o asignaciones y no se puede eliminar");
    if (!count) throw new AdminApiError(404, "NOT_FOUND", "Recurso inexistente");
    return Response.json({ deleted: true });
  } catch (error) { return adminErrorResponse(error); }
}

