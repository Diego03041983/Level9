import { adminErrorResponse, AdminApiError, requireAdminEvent } from "@/lib/admin/server";
import { drawConfirmSchema } from "@/lib/competition/schemas";

export async function POST(request: Request) {
  try {
    const parsed = drawConfirmSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { supabase } = await requireAdminEvent(parsed.data.eventId);
    const { error } = await supabase.rpc("confirm_draw", { p_draw_id: parsed.data.drawId });
    if (error) throw new AdminApiError(409, "CONFIRM_FAILED", "No se pudo confirmar: verificá que todos sigan disponibles");
    return Response.json({ confirmed: true });
  } catch (error) { return adminErrorResponse(error); }
}
