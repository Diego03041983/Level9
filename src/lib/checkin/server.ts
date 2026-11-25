import { createClient } from "@/lib/supabase/server";
export { CHECKIN_BUCKET, CHECKIN_RPC, isMissingCheckinRpc } from "./server-contract";

export type CheckinRole = "owner" | "admin" | "operator" | "checkin";

export interface CheckinContext {
  eventId: string;
  eventName: string;
  subtitle: string | null;
  isDemo: boolean;
  autoWelcome: boolean;
  role: CheckinRole;
}

export class CheckinServerError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_CONFIGURED" | "RPC_UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

export async function requireCheckinContext(eventId?: string, demo = false) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    throw new CheckinServerError("NOT_CONFIGURED", "Supabase todavía no está configurado");
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    throw new CheckinServerError("UNAUTHENTICATED", "La estación de check-in necesita iniciar sesión");
  }

  let memberships = supabase
    .from("event_users")
    .select("event_id, role, events!inner(id, name, subtitle, is_demo, event_settings(auto_welcome))")
    .eq("user_id", auth.user.id)
    .in("role", ["owner", "admin", "operator", "checkin"]);
  if (eventId) memberships = memberships.eq("event_id", eventId);

  const { data, error } = await memberships;
  if (error) throw new CheckinServerError("FORBIDDEN", "No se pudo verificar la estación de check-in");

  type Membership = {
    event_id: string;
    role: CheckinRole;
    events: {
      id: string;
      name: string;
      subtitle: string | null;
      is_demo: boolean;
      event_settings: { auto_welcome: boolean } | { auto_welcome: boolean }[] | null;
    };
  };
  const rows = (data ?? []) as unknown as Membership[];
  const membership = eventId
    ? rows[0]
    : rows.find(({ events }) => events.is_demo === demo);
  if (!membership) throw new CheckinServerError("FORBIDDEN", "Esta sesión no está habilitada para el evento solicitado");

  const settings = Array.isArray(membership.events.event_settings)
    ? membership.events.event_settings[0]
    : membership.events.event_settings;
  const context: CheckinContext = {
    eventId: membership.event_id,
    eventName: membership.events.name,
    subtitle: membership.events.subtitle,
    isDemo: membership.events.is_demo,
    autoWelcome: settings?.auto_welcome ?? true,
    role: membership.role,
  };
  return { supabase, userId: auth.user.id, context };
}

