"use client";

import { useActionState } from "react";
import { setupEvent, type SetupState } from "./actions";

const initialState: SetupState = {};

export function EventSetupForm() {
  const [state, action, pending] = useActionState(setupEvent, initialState);
  return <form action={action} className="mt-6 grid gap-4 text-left sm:grid-cols-2">
    <label className="sm:col-span-2"><span className="eyebrow !text-[.6rem]">Nombre del evento</span><input name="eventName" defaultValue="Santiago Level 9" required className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/45 px-4 py-3" /></label>
    <label className="sm:col-span-2"><span className="eyebrow !text-[.6rem]">Subtítulo</span><input name="subtitle" defaultValue="Gamer Party" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/45 px-4 py-3" /></label>
    <label><span className="eyebrow !text-[.6rem]">Cumpleañero</span><input name="celebrantName" defaultValue="Santiago" required className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/45 px-4 py-3" /></label>
    <label><span className="eyebrow !text-[.6rem]">Edad</span><input name="celebrantAge" type="number" defaultValue="9" min="1" max="120" required className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/45 px-4 py-3" /></label>
    <label><span className="eyebrow !text-[.6rem]">Inicio</span><input name="startsAt" type="datetime-local" defaultValue="2026-11-29T16:00" required className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/45 px-4 py-3" /></label>
    <label><span className="eyebrow !text-[.6rem]">Cierre</span><input name="endsAt" type="datetime-local" defaultValue="2026-11-29T19:00" required className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/45 px-4 py-3" /></label>
    {state.error ? <p role="alert" className="sm:col-span-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p> : null}
    <button disabled={pending} className="primary-action sm:col-span-2 px-5 py-4 disabled:opacity-50">{pending ? "CREANDO EVENTO…" : "CREAR EVENTO REAL"}</button>
  </form>;
}
