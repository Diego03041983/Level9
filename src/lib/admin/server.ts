import { createClient } from "@/lib/supabase/server";

type AdminRole = "owner" | "admin" | "operator";

export class AdminApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function requireAdminEvent(eventId?: string) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try { supabase = await createClient(); }
  catch { throw new AdminApiError(503, "NOT_CONFIGURED", "Supabase no está configurado"); }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new AdminApiError(401, "UNAUTHENTICATED", "La sesión expiró");
  let query = supabase.from("event_users").select("event_id, role, events!inner(id,name,is_demo,timezone)")
    .eq("user_id", auth.user.id).in("role", ["owner", "admin", "operator"]);
  if (eventId) query = query.eq("event_id", eventId);
  const { data, error } = await query;
  if (error) throw new AdminApiError(403, "FORBIDDEN", "No se pudo verificar el evento");
  type Row = { event_id: string; role: AdminRole; events: { id: string; name: string; is_demo: boolean; timezone: string } };
  const rows = (data ?? []) as unknown as Row[];
  const member = eventId ? rows[0] : rows.find((row) => !row.events.is_demo) ?? rows[0];
  if (!member) throw new AdminApiError(403, "FORBIDDEN", "No administrás ningún evento");
  return { supabase, userId: auth.user.id, event: member.events, role: member.role };
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  return Response.json({ error: "Error inesperado" }, { status: 500 });
}
