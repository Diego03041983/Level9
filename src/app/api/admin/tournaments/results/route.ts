import { adminErrorResponse, AdminApiError, requireAdminEvent } from "@/lib/admin/server";
import { matchResultSchema } from "@/lib/competition/schemas";

export async function POST(request: Request) {
  try {
    const parsed = matchResultSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { supabase } = await requireAdminEvent(parsed.data.eventId);
    const { error } = await supabase.rpc("confirm_match_result", {
      p_match_id: parsed.data.matchId, p_winner_entry_id: parsed.data.winnerEntryId,
      p_score: { home: parsed.data.homeScore, away: parsed.data.awayScore }, p_decided_by: parsed.data.decidedBy,
      p_expected_version: parsed.data.expectedVersion,
    });
    if (error) throw new AdminApiError(409, "RESULT_REJECTED", "Resultado rechazado: el partido cambió, ya fue confirmado o el ganador no participa");
    return Response.json({ confirmed: true });
  } catch (error) { return adminErrorResponse(error); }
}
