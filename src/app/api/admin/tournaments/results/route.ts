import { adminErrorResponse, AdminApiError, requireAdminEvent } from "@/lib/admin/server";
import { matchResultSchema } from "@/lib/competition/schemas";
import { dispatchAudiovisualEvent } from "@/lib/audiovisual/dispatch";

export async function POST(request: Request) {
  try {
    const parsed = matchResultSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { supabase, event, userId } = await requireAdminEvent(parsed.data.eventId);
    const { error } = await supabase.rpc("confirm_match_result", {
      p_match_id: parsed.data.matchId, p_winner_entry_id: parsed.data.winnerEntryId,
      p_score: { home: parsed.data.homeScore, away: parsed.data.awayScore }, p_decided_by: parsed.data.decidedBy,
      p_expected_version: parsed.data.expectedVersion,
    });
    if (error) throw new AdminApiError(409, "RESULT_REJECTED", "Resultado rechazado: el partido cambió, ya fue confirmado o el ganador no participa");
    const {data:winnerEntry}=await supabase.from("tournament_entries").select("participant_id,team_id").eq("id",parsed.data.winnerEntryId).maybeSingle();
    let participantIds:string[]=[];
    if(winnerEntry?.participant_id)participantIds=[winnerEntry.participant_id];
    else if(winnerEntry?.team_id){const{data:members}=await supabase.from("team_members").select("participant_id").eq("team_id",winnerEntry.team_id);participantIds=(members??[]).map(item=>item.participant_id)}
    try{await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"WINNER_CONFIRMED",context:{participantIds,title:"RESULTADO CONFIRMADO",extra:{homeScore:parsed.data.homeScore,awayScore:parsed.data.awayScore}},rehearsal:false,confirm:true,idempotencyKey:`match:${parsed.data.matchId}:result:${parsed.data.expectedVersion}`,userId})}catch(error){console.error("Confirmed result audiovisual dispatch failed",error)}
    return Response.json({ confirmed: true });
  } catch (error) { return adminErrorResponse(error); }
}
