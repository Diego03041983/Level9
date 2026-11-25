import { randomUUID } from "node:crypto";
import { drawParticipants } from "@/lib/domain";
import { requireAdminEvent, adminErrorResponse, AdminApiError } from "@/lib/admin/server";
import { drawPreviewSchema } from "@/lib/competition/schemas";

export async function POST(request: Request) {
  try {
    const parsed = drawPreviewSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    const [{ data: players }, { data: preferences }, { data: assignments }] = await Promise.all([
      supabase.from("participants").select("id,arrived_at,administrative_status,operational_status").eq("event_id", event.id),
      supabase.from("participant_activity_preferences").select("participant_id,activity_id,enabled").eq("activity_id", parsed.data.activityId),
      supabase.from("station_assignments").select("participant_id").eq("event_id", event.id).in("status", ["reserved", "active"]),
    ]);
    const enabled = new Set((preferences ?? []).filter((item) => item.enabled).map((item) => item.participant_id));
    const occupied = new Set((assignments ?? []).map((item) => item.participant_id));
    const result = drawParticipants({ activityId: parsed.data.activityId, count: parsed.data.count, mode: parsed.data.mode,
      fixedIds: parsed.data.fixedIds, candidates: (players ?? []).map((player) => ({ id: player.id,
        registered: Boolean(player.arrived_at), active: player.administrative_status === "active",
        occupied: occupied.has(player.id) || !["available", "resting"].includes(player.operational_status),
        enabledActivityIds: enabled.has(player.id) ? [parsed.data.activityId] : [], participationCount: 0 })) });
    const seed = randomUUID();
    const { data: drawId, error } = await supabase.rpc("persist_draw_preview", {
      p_event_id: event.id, p_activity_id: parsed.data.activityId, p_draw_type: parsed.data.drawType,
      p_algorithm: parsed.data.mode, p_seed: seed, p_selected_ids: result.selected.map(({ id }) => id),
      p_constraints: { count: parsed.data.count, fixedIds: parsed.data.fixedIds },
    });
    if (error) throw new AdminApiError(409, "PREVIEW_FAILED", error.message.includes("function") ? "Aplicá la migración 0002 para habilitar sorteos" : "La disponibilidad cambió durante el sorteo");
    return Response.json({ drawId, selectedIds: result.selected.map(({ id }) => id), excluded: result.excluded }, { status: 201 });
  } catch (error) { return adminErrorResponse(error); }
}
