import { adminErrorResponse, AdminApiError, requireAdminEvent } from "@/lib/admin/server";
import { drawConfirmSchema } from "@/lib/competition/schemas";
import { dispatchAudiovisualEvent } from "@/lib/audiovisual/dispatch";

export async function POST(request: Request) {
  try {
    const parsed = drawConfirmSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { supabase, event, userId } = await requireAdminEvent(parsed.data.eventId);
    const { error } = await supabase.rpc("confirm_draw", { p_draw_id: parsed.data.drawId });
    if (error) throw new AdminApiError(409, "CONFIRM_FAILED", "No se pudo confirmar: verificá que todos sigan disponibles");
    const { data: results } = await supabase.from("draw_results").select("participant_id").eq("draw_id", parsed.data.drawId).order("position");
    const participantIds=(results??[]).map(item=>item.participant_id).filter((id):id is string=>typeof id==="string");
    try{await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"DRAW_CONFIRMED",context:{participantIds,title:"SORTEO CONFIRMADO"},rehearsal:false,confirm:true,idempotencyKey:`draw:${parsed.data.drawId}:confirmed`,userId})}catch(error){console.error("Confirmed draw audiovisual dispatch failed",error)}
    return Response.json({ confirmed: true });
  } catch (error) { return adminErrorResponse(error); }
}
