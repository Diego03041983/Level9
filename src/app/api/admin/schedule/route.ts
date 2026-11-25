import { NextRequest } from "next/server";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { eventIdSchema, scheduleCreateSchema, schedulePatchSchema } from "@/lib/admin/schemas";
import { canTransitionSchedule, type ScheduleStatus } from "@/lib/admin/schedule-transitions";

const select = "id,title,starts_at,ends_at,position,status,activity_id,scene_type";

export async function GET(request: NextRequest) {
  try {
    const rawEventId = request.nextUrl.searchParams.get("eventId");
    const eventId = rawEventId ? eventIdSchema.parse(rawEventId) : undefined;
    const { supabase, event } = await requireAdminEvent(eventId);
    const { data, error } = await supabase.from("schedule_items").select(select).eq("event_id", event.id).order("position");
    if (error) throw new AdminApiError(500, "READ_FAILED", "No se pudo cargar la agenda");
    return Response.json({ event, items: data }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = scheduleCreateSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    const { data: last } = await supabase.from("schedule_items").select("position").eq("event_id", event.id)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from("schedule_items").insert({
      event_id: event.id, title: parsed.data.title, starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt ?? null, activity_id: parsed.data.activityId ?? null,
      scene_type: parsed.data.sceneType ?? null, position: (last?.position ?? 0) + 1,
    }).select(select).single();
    if (error) throw new AdminApiError(409, "CREATE_FAILED", "No se pudo crear el bloque de agenda");
    return Response.json({ item: data }, { status: 201 });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = schedulePatchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    if (parsed.data.operation === "edit") {
      const { data, error } = await supabase.from("schedule_items").update({ title: parsed.data.title,
        starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, scene_type: parsed.data.sceneType })
        .eq("id", parsed.data.itemId).eq("event_id", event.id).select(select).single();
      if (error) throw new AdminApiError(409, "UPDATE_FAILED", "No se pudo editar la agenda");
      return Response.json({ item: data });
    }
    if (parsed.data.operation === "status") {
      const { data: current } = await supabase.from("schedule_items").select("status").eq("id", parsed.data.itemId)
        .eq("event_id", event.id).maybeSingle();
      if (!current) throw new AdminApiError(404, "NOT_FOUND", "Bloque de agenda inexistente");
      if (!canTransitionSchedule(current.status as ScheduleStatus, parsed.data.status)) {
        throw new AdminApiError(409, "INVALID_TRANSITION", "Ese cambio no corresponde al estado actual");
      }
      const { data, error } = await supabase.from("schedule_items").update({ status: parsed.data.status })
        .eq("id", parsed.data.itemId).eq("event_id", event.id).select(select).single();
      if (error) throw new AdminApiError(409, "STATUS_FAILED", "No se pudo cambiar el estado");
      return Response.json({ item: data });
    }
    const { data: existing, error: readError } = await supabase.from("schedule_items").select("id,position")
      .eq("event_id", event.id).in("id", parsed.data.orderedIds);
    const { count: total } = await supabase.from("schedule_items").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    if (readError || existing?.length !== parsed.data.orderedIds.length || total !== parsed.data.orderedIds.length) throw new AdminApiError(400, "INVALID_ORDER", "El orden no coincide con la agenda completa");
    // Move to a collision-free negative range, then assign final positions.
    for (let index = 0; index < parsed.data.orderedIds.length; index += 1) {
      const { error } = await supabase.from("schedule_items").update({ position: -(index + 1) })
        .eq("id", parsed.data.orderedIds[index]).eq("event_id", event.id);
      if (error) throw new AdminApiError(409, "REORDER_FAILED", "No se pudo preparar el nuevo orden");
    }
    for (let index = 0; index < parsed.data.orderedIds.length; index += 1) {
      const { error } = await supabase.from("schedule_items").update({ position: index + 1 })
        .eq("id", parsed.data.orderedIds[index]).eq("event_id", event.id);
      if (error) throw new AdminApiError(409, "REORDER_FAILED", "El orden quedó incompleto; recargá antes de continuar");
    }
    return Response.json({ orderedIds: parsed.data.orderedIds });
  } catch (error) { return adminErrorResponse(error); }
}
