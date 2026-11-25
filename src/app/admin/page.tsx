import { redirect } from "next/navigation";
import { AdminDashboard } from "./AdminDashboard";
import { EventSetupForm } from "./EventSetupForm";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

type Membership = {
  event_id: string;
  role: string;
  events: { name: string; subtitle: string | null } | { name: string; subtitle: string | null }[];
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/admin");

  const { data, error } = await supabase
    .from("event_users")
    .select("event_id, role, events!inner(name, subtitle)")
    .eq("user_id", auth.user.id)
    .in("role", ["owner", "admin", "operator"])
    .limit(1)
    .maybeSingle();

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <section className="panel cut max-w-xl p-8">
          <p className="eyebrow">Configuración pendiente</p>
          <h1 className="mt-3 text-3xl font-black">NO SE PUDO ABRIR EL EVENTO</h1>
          <p className="mt-4 text-slate-300">La base de datos respondió con un error. Revisá que las migraciones estén instaladas y volvé a intentar.</p>
          <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error.message}</p>
        </section>
      </main>
    );
  }

  const membership = data as unknown as Membership | null;
  if (!membership) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <section className="panel cut max-w-xl p-8">
          <p className="eyebrow">Acceso protegido</p>
          <h1 className="mt-3 text-3xl font-black">FALTA ASIGNAR ESTE OPERADOR</h1>
          <p className="mt-4 text-slate-300">Esta cuenta todavía no tiene un evento. Creá ahora la instancia real; quedará asignada como dueña.</p>
          <EventSetupForm />
        </section>
      </main>
    );
  }

  const event = Array.isArray(membership.events) ? membership.events[0] : membership.events;
  return <AdminDashboard eventId={membership.event_id} eventName={event?.name ?? "Level 9"} eventSubtitle={event?.subtitle ?? null} role={membership.role} />;
}
