import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceptionConsole } from "./ReceptionConsole";

export const instant = false;

export default async function ReceptionPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/admin/reception");
  const { data } = await supabase.from("event_users")
    .select("event_id,events!inner(name,is_demo)").eq("user_id", auth.user.id)
    .in("role", ["owner", "admin", "operator"]).limit(5);
  type Membership = { event_id: string; events: { name: string; is_demo: boolean } | { name: string; is_demo: boolean }[] };
  const rows = (data ?? []) as unknown as Membership[];
  const membership = rows.find((row) => !(Array.isArray(row.events) ? row.events[0]?.is_demo : row.events.is_demo)) ?? rows[0];
  if (!membership) redirect("/admin");
  const event = Array.isArray(membership.events) ? membership.events[0] : membership.events;
  return <ReceptionConsole eventId={membership.event_id} eventName={event?.name ?? "Level 9"} />;
}

