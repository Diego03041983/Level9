import { NextRequest } from "next/server";
import { adminErrorResponse, AdminApiError, requireAdminEvent } from "@/lib/admin/server";
import { actionNeedsConflictCheck, canApplyPlayerAction, playerTransition } from "@/lib/admin/player-transitions";
import { eventIdSchema, playerActionSchema } from "@/lib/admin/schemas";

export async function GET(request: NextRequest) {
  try {
    const rawEventId = request.nextUrl.searchParams.get("eventId");
    const eventId = rawEventId ? eventIdSchema.parse(rawEventId) : undefined;
    const { supabase, event } = await requireAdminEvent(eventId);
    const search = request.nextUrl.searchParams.get("q")?.trim();
    let query = supabase.from("participants")
      .select("id,first_name,last_name,gamer_tag,player_number,registration_status,administrative_status,operational_status,arrived_at,departed_at,is_celebrant")
      .eq("event_id", event.id).order("player_number");
    if (search) query = query.or(`first_name.ilike.%${search.replace(/[%_,()]/g, "")}%,last_name.ilike.%${search.replace(/[%_,()]/g, "")}%,gamer_tag.ilike.%${search.replace(/[%_,()]/g, "")}%`);
    const { data, error } = await query;
    if (error) throw new AdminApiError(500, "READ_FAILED", "No se pudieron cargar los participantes");
    return Response.json({ event, players: data }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = playerActionSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    const { data: participant } = await supabase.from("participants").select("id,event_id,administrative_status,operational_status")
      .eq("id", parsed.data.participantId).eq("event_id", event.id).maybeSingle();
    if (!participant) throw new AdminApiError(404, "NOT_FOUND", "Participante inexistente");
    if (!canApplyPlayerAction(parsed.data.action, participant.administrative_status, participant.operational_status)) {
      throw new AdminApiError(409, "INVALID_TRANSITION", "La acción no corresponde al estado actual del participante");
    }
    if (actionNeedsConflictCheck(parsed.data.action)) {
      const { count } = await supabase.from("station_assignments").select("id", { count: "exact", head: true })
        .eq("participant_id", participant.id).in("status", ["reserved", "active"]);
      if ((count ?? 0) > 0) throw new AdminApiError(409, "ACTIVE_ASSIGNMENT", "Resolvé primero la competencia o estación activa");
    }
    const now = new Date().toISOString();
    const patch = playerTransition(parsed.data.action, now);
    const { data, error } = await supabase.from("participants").update(patch).eq("id", participant.id)
      .eq("event_id", event.id).select("id,administrative_status,operational_status,arrived_at,departed_at").single();
    if (error) throw new AdminApiError(409, "UPDATE_FAILED", "No se pudo actualizar el participante");
    await supabase.from("participant_availability").update({ ends_at: now }).eq("participant_id", participant.id).is("ends_at", null);
    await supabase.from("participant_availability").insert({
      participant_id: participant.id, status: patch.operational_status, starts_at: now,
      reason: `admin:${parsed.data.action}`, source_type: "admin",
    });
    return Response.json({ player: data });
  } catch (error) { return adminErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const body=await request.json() as {eventId?:string;participantId?:string};
    const eventId=eventIdSchema.safeParse(body.eventId), participantId=eventIdSchema.safeParse(body.participantId);
    if(!eventId.success||!participantId.success)return Response.json({error:"Datos inválidos"},{status:400});
    const {supabase,event}=await requireAdminEvent(eventId.data);
    const {error}=await supabase.rpc("delete_event_player",{p_event_id:event.id,p_participant_id:participantId.data});
    if(error)throw new AdminApiError(409,"DELETE_FAILED",error.message);
    return Response.json({ok:true});
  }catch(error){return adminErrorResponse(error)}
}
