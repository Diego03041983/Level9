import { NextRequest } from "next/server";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId") ?? undefined;
    const { supabase, event } = await requireAdminEvent(eventId);
    const [{ data: activities }, { data: players }, { data: draws, error }] = await Promise.all([
      supabase.from("activities").select("id,name,activity_type").eq("event_id", event.id).eq("enabled", true),
      supabase.from("participants").select("id,first_name,gamer_tag,player_number,administrative_status,operational_status").eq("event_id", event.id).order("player_number"),
      supabase.from("draws").select("id,activity_id,draw_type,status,algorithm,created_at,confirmed_at").eq("event_id", event.id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (error) throw new AdminApiError(500, "READ_FAILED", "No se pudieron cargar los sorteos");
    const drawIds = (draws ?? []).map(({ id }) => id);
    const { data: results } = drawIds.length ? await supabase.from("draw_results").select("draw_id,position,participant_id,group_key").in("draw_id", drawIds).order("position") : { data: [] };
    return Response.json({ event, activities, players, draws: (draws ?? []).map((draw) => ({ ...draw, results: (results ?? []).filter((result) => result.draw_id === draw.id) })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
