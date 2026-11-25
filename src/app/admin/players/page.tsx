"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/ui/AppShell";

type Action = "activate" | "deactivate" | "withdraw" | "pause" | "reinstate";
type Player = { id: string; first_name: string; last_name: string | null; gamer_tag: string | null; player_number: number;
  administrative_status: string; operational_status: string; is_celebrant: boolean };
type EventInfo = { id: string; name: string };

const actions: Array<{ key: Action; label: string }> = [
  { key: "activate", label: "Activar" }, { key: "pause", label: "Pausar" },
  { key: "reinstate", label: "Reincorporar" }, { key: "deactivate", label: "Desactivar" },
  { key: "withdraw", label: "Registrar retiro" },
];

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [event, setEvent] = useState<EventInfo>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async (q = "") => {
    const response = await fetch(`/api/admin/players${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
    const body = await response.json() as { event?: EventInfo; players?: Player[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el roster");
    setEvent(body.event); setPlayers(body.players ?? []);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error: Error) => setMessage(error.message)), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(player: Player, action: Action) {
    if (!event) return;
    setBusy(player.id + action); setMessage(undefined);
    try {
      const response = await fetch("/api/admin/players", { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: event.id, participantId: player.id, action }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar");
      await load(query); setMessage(`${player.gamer_tag || player.first_name}: estado actualizado`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error inesperado"); }
    finally { setBusy(undefined); }
  }

  return <AppShell active="admin"><main className="mx-auto w-full max-w-7xl px-5 pb-16 pt-7 md:px-8"><p className="eyebrow">Operación · {event?.name ?? "Cargando evento"}</p><div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="display-title text-4xl md:text-6xl">Participantes</h1><p className="mt-2 text-sm text-slate-400">Estado administrativo y disponibilidad operativa se gestionan por separado.</p></div><form onSubmit={(e) => { e.preventDefault(); void load(query).catch((error: Error) => setMessage(error.message)); }} className="flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jugador" className="rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-cyan-300/60"/><button className="primary-action px-5">Buscar</button></form></div>
  {message && <p role="status" className="mt-5 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-100">{message}</p>}
  <section className="mt-6 grid gap-3">{players.map((player) => <article key={player.id} className="panel cut grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-lg bg-cyan-300/10 font-mono font-black text-cyan-300">#{String(player.player_number).padStart(2, "0")}</div><div><h2 className="font-black">{player.gamer_tag || `${player.first_name} ${player.last_name ?? ""}`.trim()} {player.is_celebrant && <span className="text-yellow-300">★</span>}</h2><div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider"><span className="rounded bg-white/5 px-2 py-1 text-slate-300">{player.administrative_status}</span><span className="rounded bg-lime-300/10 px-2 py-1 text-lime-300">{player.operational_status}</span></div></div></div><div className="flex flex-wrap gap-2">{actions.map(({ key, label }) => <button key={key} disabled={Boolean(busy)} onClick={() => void act(player, key)} className={`ghost-action px-3 py-2 text-xs ${key === "withdraw" ? "text-red-300" : ""}`}>{busy === player.id + key ? "Guardando…" : label}</button>)}</div></article>)}{!players.length && <div className="panel p-8 text-center text-slate-400">No hay participantes para mostrar.</div>}</section></main></AppShell>;
}
