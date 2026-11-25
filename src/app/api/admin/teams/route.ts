import { NextRequest } from "next/server";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { teamDeleteSchema, teamSaveSchema } from "@/lib/admin/operations-schemas";
import { eventIdSchema } from "@/lib/admin/schemas";

export async function GET(request: NextRequest) {
  try {
    const rawEventId = request.nextUrl.searchParams.get("eventId");
    const requested = rawEventId ? eventIdSchema.parse(rawEventId) : undefined;
    const { supabase, event } = await requireAdminEvent(requested);
    const [teams, members, activities, participants] = await Promise.all([
      supabase.from("teams").select("id,activity_id,name,color,team_type,locked,created_at").eq("event_id", event.id).order("created_at"),
      supabase.from("team_members").select("team_id,participant_id,position").order("position"),
      supabase.from("activities").select("id,name,activity_type").eq("event_id", event.id).eq("enabled", true).order("name"),
      supabase.from("participants").select("id,first_name,last_name,gamer_tag,player_number,operational_status")
        .eq("event_id", event.id).eq("administrative_status", "active").order("player_number"),
    ]);
    const failed = [teams, members, activities, participants].find((result) => result.error);
    if (failed?.error) throw new AdminApiError(500, "READ_FAILED", "No se pudieron cargar los equipos");
    return Response.json({ event, teams: teams.data, members: members.data, activities: activities.data,
      participants: participants.data }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

async function save(request: NextRequest, requireId: boolean) {
  try {
    const parsed = teamSaveSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    if (requireId && !parsed.data.teamId) return Response.json({ error: "Falta el equipo", code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    const { data, error } = await supabase.rpc("save_team_with_members", { p_event_id: event.id,
      p_team_id: parsed.data.teamId ?? null, p_activity_id: parsed.data.activityId ?? null,
      p_name: parsed.data.name, p_color: parsed.data.color, p_team_type: parsed.data.teamType,
      p_member_ids: parsed.data.memberIds });
    if (error) throw new AdminApiError(409, "SAVE_FAILED", "No se pudo guardar: revisá integrantes, actividad y bloqueo del equipo");
    return Response.json({ team: data }, { status: requireId ? 200 : 201 });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: NextRequest) { return save(request, false); }
export async function PATCH(request: NextRequest) { return save(request, true); }

export async function DELETE(request: NextRequest) {
  try {
    const parsed = teamDeleteSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message, code: "INVALID_INPUT" }, { status: 400 });
    const { supabase, event } = await requireAdminEvent(parsed.data.eventId);
    const { data: team } = await supabase.from("teams").select("id,locked").eq("id", parsed.data.teamId)
      .eq("event_id", event.id).maybeSingle();
    if (!team) throw new AdminApiError(404, "NOT_FOUND", "Equipo inexistente");
    if (team.locked) throw new AdminApiError(409, "LOCKED", "El equipo está bloqueado por una competencia");
    const { error } = await supabase.from("teams").delete().eq("id", team.id).eq("event_id", event.id);
    if (error) throw new AdminApiError(409, "DELETE_FAILED", "El equipo tiene historial y no puede eliminarse");
    return Response.json({ deleted: true });
  } catch (error) { return adminErrorResponse(error); }
}

