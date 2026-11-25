import { NextRequest } from "next/server";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { tournamentCreateSchema } from "@/lib/competition/schemas";

export async function GET(request: NextRequest) {
  try {
    const { supabase, event } = await requireAdminEvent(request.nextUrl.searchParams.get("eventId") ?? undefined);
    const [{ data: activities }, { data: players }, { data: tournaments, error }] = await Promise.all([
      supabase.from("activities").select("id,name").eq("event_id", event.id).eq("activity_type", "fifa").eq("enabled", true),
      supabase.from("participants").select("id,first_name,gamer_tag,player_number,administrative_status,operational_status").eq("event_id", event.id).order("player_number"),
      supabase.from("tournaments").select("id,activity_id,name,status,rules,champion_entry_id,runner_up_entry_id").eq("event_id", event.id).eq("format", "single_elimination").order("created_at", { ascending: false }),
    ]);
    if (error) throw new AdminApiError(500, "READ_FAILED", "No se pudieron cargar los torneos");
    const ids = (tournaments ?? []).map(({ id }) => id);
    const entries = ids.length ? (await supabase.from("tournament_entries").select("id,tournament_id,participant_id,seed,status").in("tournament_id", ids)).data ?? [] : [];
    const rounds = ids.length ? (await supabase.from("tournament_rounds").select("id,tournament_id,round_number,name,status").in("tournament_id", ids).order("round_number")).data ?? [] : [];
    const matches = ids.length ? (await supabase.from("matches").select("id,tournament_id,round_id,match_number,status,next_match_id,next_slot,version").in("tournament_id", ids)).data ?? [] : [];
    const matchIds = matches.map(({ id }) => id);
    const participants = matchIds.length ? (await supabase.from("match_participants").select("match_id,slot,entry_id").in("match_id", matchIds)).data ?? [] : [];
    const results = matchIds.length ? (await supabase.from("match_results").select("match_id,winner_entry_id,score,decided_by").in("match_id", matchIds)).data ?? [] : [];
    return Response.json({ event, activities, players, tournaments, entries, rounds, matches, matchParticipants: participants, results }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const parsed = tournamentCreateSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    const { data: tournamentId, error } = await supabase.rpc("create_single_elimination_tournament", {
      p_event_id: event.id, p_activity_id: parsed.data.activityId, p_name: parsed.data.name,
      p_participant_ids: parsed.data.participantIds,
    });
    if (error) throw new AdminApiError(409, "CREATE_FAILED", error.message.includes("function") ? "Aplicá la migración 0007 para habilitar torneos" : "No se pudo crear: revisá disponibilidad y habilitación FIFA");
    return Response.json({ tournamentId }, { status: 201 });
  } catch (error) { return adminErrorResponse(error); }
}
