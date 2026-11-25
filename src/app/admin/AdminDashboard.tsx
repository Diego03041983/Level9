"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { PlayerBadge } from "@/components/ui/PlayerBadge";
import { createClient } from "@/lib/supabase/client";

type Participant = { id: string; first_name: string; gamer_tag: string | null; player_number: number; operational_status: string; administrative_status: string; photo_path: string | null };
type Station = { id: string; name: string; status: string };
type Device = { id: string; name: string; last_seen_at: string | null; audio_enabled: boolean; revoked_at: string | null };
type Scene = { id: string; scene_type: string; status: string; created_at: string };
type ScheduleItem = { id: string; title: string; starts_at: string; status: string };
type Props = { eventId: string; eventName: string; eventSubtitle: string | null; role: string };

const sceneLabel: Record<string, string> = {
  WELCOME_SCREEN: "Pantalla de bienvenida",
  PLAYER_WELCOME: "Bienvenida de jugador",
  VERSUS: "Versus",
  ANNOUNCEMENT: "Anuncio",
  AUDIO_CONTROL: "Control de audio",
};

export function AdminDashboard({ eventId, eventName, eventSubtitle, role }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [feed, setFeed] = useState("Conectando con el evento…");
  const [busy, setBusy] = useState(false);
  const [pairingUrl, setPairingUrl] = useState("");
  const [clock, setClock] = useState(0);

  const loadData = useCallback(async () => {
    const [playersResult, stationsResult, devicesResult, scenesResult, scheduleResult] = await Promise.all([
      supabase.from("participants").select("id, first_name, gamer_tag, player_number, operational_status, administrative_status, photo_path").eq("event_id", eventId).order("player_number"),
      supabase.from("stations").select("id, name, status").eq("event_id", eventId).order("name"),
      supabase.from("display_devices").select("id, name, last_seen_at, audio_enabled, revoked_at").eq("event_id", eventId),
      supabase.from("scene_events").select("id, scene_type, status, created_at").eq("event_id", eventId).order("created_at", { ascending: false }).limit(20),
      supabase.from("schedule_items").select("id, title, starts_at, status").eq("event_id", eventId).order("starts_at").limit(8),
    ]);
    const failure = [playersResult.error, stationsResult.error, devicesResult.error, scenesResult.error, scheduleResult.error].find(Boolean);
    if (failure) return setFeed(`Error de sincronización: ${failure.message}`);
    setParticipants((playersResult.data ?? []) as Participant[]);
    setStations((stationsResult.data ?? []) as unknown as Station[]);
    setDevices((devicesResult.data ?? []) as unknown as Device[]);
    setScenes((scenesResult.data ?? []) as unknown as Scene[]);
    setSchedule((scheduleResult.data ?? []) as unknown as ScheduleItem[]);
    setFeed("Panel sincronizado con Supabase");
  }, [eventId, supabase]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    const initialClock = window.setTimeout(() => setClock(Date.now()), 0);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 15_000);
    const channel = supabase.channel(`admin:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `event_id=eq.${eventId}` }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "stations", filter: `event_id=eq.${eventId}` }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "display_devices", filter: `event_id=eq.${eventId}` }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "scene_events", filter: `event_id=eq.${eventId}` }, loadData)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setFeed("Actualización en vivo activa");
        if (status === "CHANNEL_ERROR") setFeed("Realtime desconectado; reintentando…");
      });
    return () => { clearTimeout(initialLoad); clearTimeout(initialClock); clearInterval(clockTimer); void supabase.removeChannel(channel); };
  }, [eventId, loadData, supabase]);

  const connectedDevices = devices.filter((device) => clock > 0 && !device.revoked_at && device.last_seen_at && clock - Date.parse(device.last_seen_at) < 60_000);
  const audioEnabled = connectedDevices.some((device) => device.audio_enabled);
  const activePlayers = participants.filter((player) => player.administrative_status === "active");
  const availableStations = stations.filter((station) => station.status === "available");
  const queuedScenes = scenes.filter((scene) => ["queued", "delivered", "playing"].includes(scene.status));
  const chosenPlayers = selected.map((id) => participants.find((player) => player.id === id)).filter((player): player is Participant => Boolean(player));
  const togglePlayer = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current.slice(-1), id]);

  const sendScene = async (sceneType: string, payload: Record<string, unknown>, options: { priority?: number; durationMs?: number; sound?: Record<string, unknown>; interruptPolicy?: string } = {}) => {
    setBusy(true);
    setFeed("Enviando escena al televisor…");
    const { error } = await supabase.from("scene_events").insert({
      event_id: eventId,
      scene_type: sceneType,
      payload,
      priority: options.priority ?? 50,
      duration_ms: options.durationMs ?? 12_000,
      sound: options.sound ?? {},
      animation: { preset: "neon" },
      interrupt_policy: options.interruptPolicy ?? "queue",
      status: "queued",
      idempotency_key: `${sceneType.toLowerCase()}:${crypto.randomUUID()}`,
    });
    setBusy(false);
    if (error) { setFeed(`No se pudo enviar: ${error.message}`); return false; }
    setFeed(`${sceneLabel[sceneType] ?? sceneType} enviada al televisor`);
    return true;
  };

  const showVersus = async () => {
    if (chosenPlayers.length !== 2) return setFeed("Seleccioná exactamente dos jugadores para mostrar el VS");
    await sendScene("VERSUS", {
      title: "PRÓXIMO ENFRENTAMIENTO",
      activity: "FIFA LEGENDS CUP",
      players: chosenPlayers.map((player) => ({ name: player.first_name, gamerTag: player.gamer_tag, number: player.player_number, photoPath: player.photo_path })),
    }, { priority: 70, durationMs: 15_000, sound: { name: "versus", volume: 0.9 }, interruptPolicy: "interrupt_lower" });
  };

  const sendAnnouncement = async () => {
    const message = announcement.trim();
    if (!message) return setFeed("Escribí el anuncio antes de enviarlo");
    if (await sendScene("ANNOUNCEMENT", { title: "ATENCIÓN", message }, { priority: 80, sound: { name: "announcement", volume: 0.85 }, interruptPolicy: "overlay" })) setAnnouncement("");
  };

  const setAudio = async (enabled: boolean) => {
    await sendScene("AUDIO_CONTROL", { enabled, message: enabled ? "Audio activado" : "Audio silenciado" }, { priority: 100, durationMs: 3_000, interruptPolicy: "force" });
  };

  const createDisplayPairing = async () => {
    setBusy(true); setFeed("Creando vínculo seguro para Smart TV…");
    const response = await fetch("/tv/pair", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({eventId,name:"Smart TV principal"}) });
    const data = await response.json() as {pairingUrl?:string;error?:string}; setBusy(false);
    if(!response.ok||!data.pairingUrl){setFeed(`No se pudo vincular: ${data.error??"error desconocido"}`);return}
    setPairingUrl(data.pairingUrl);setFeed("Vínculo creado. Abrilo una sola vez en el Smart TV.");
  };

  const stats = [
    { label: "Jugadores activos", value: String(activePlayers.length), meta: `${participants.length} registrados`, tone: "text-cyan-300" },
    { label: "Estaciones libres", value: `${availableStations.length}/${stations.length}`, meta: "estado en tiempo real", tone: "text-lime-300" },
    { label: "TV conectadas", value: String(connectedDevices.length), meta: devices.length ? `${devices.length} vinculadas` : "sin vincular", tone: "text-violet-300" },
    { label: "Cola audiovisual", value: String(queuedScenes.length), meta: "escenas pendientes", tone: "text-yellow-300" },
  ];

  return <AppShell active="admin"><div className="mx-auto w-full max-w-[1500px] px-5 pb-24 md:px-8">
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="eyebrow">{eventSubtitle ?? "Operación en vivo"} · {role}</p><h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">{eventName.toUpperCase()}</h1></div><div className={`flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-bold ${connectedDevices.length ? "border-lime-300/20 bg-lime-300/5 text-lime-200" : "border-yellow-300/20 bg-yellow-300/5 text-yellow-100"}`}><i className="status-dot" /> {connectedDevices.length ? `TV conectada · Audio ${audioEnabled ? "activo" : "silenciado"}` : "TV sin conexión reciente"}</div></div>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <article key={stat.label} className="panel cut p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">{stat.label}</p><strong className={`mt-3 block font-mono text-4xl ${stat.tone}`}>{stat.value}</strong><small className="mt-3 block text-slate-500">{stat.meta}</small></article>)}</section>
    <nav aria-label="Módulos operativos" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{[["Jugadores","/admin/players"],["Actividades","/admin/activities"],["Equipos","/admin/teams"],["Sorteos","/admin/draws"],["Torneos","/admin/tournaments"],["Agenda","/admin/schedule"],["Pantalla","/admin/display"]].map(([label,href])=><Link key={href} href={href} className="ghost-action px-3 py-3 text-center text-xs">{label}</Link>)}</nav>
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <div className="panel cut p-5 md:p-7"><p className="eyebrow">Control audiovisual</p><h2 className="mt-2 text-2xl font-black">ENVIAR A LA TV</h2><p className="mt-3 text-sm text-slate-400">Elegí dos jugadores del roster y enviá el versus. La escena queda persistida y el televisor la recibe por Realtime.</p><div className="mt-5 flex flex-wrap gap-2">{activePlayers.map((player, index) => <button type="button" aria-pressed={selected.includes(player.id)} onClick={() => togglePlayer(player.id)} key={player.id} className={`flex items-center gap-2 rounded-lg border p-2 pr-4 text-sm font-bold transition ${selected.includes(player.id) ? "border-cyan-300 bg-cyan-300/10" : "border-white/8 bg-white/[.025] hover:border-cyan-300/30"}`}><PlayerBadge name={player.first_name} number={player.player_number} color={index % 2 ? "violet" : "cyan"} />{player.gamer_tag || player.first_name}</button>)}{!activePlayers.length ? <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-slate-400">Todavía no hay jugadores activos. Abrí Check-in para registrarlos.</p> : null}</div><div className="mt-5 grid gap-2 sm:grid-cols-3"><button disabled={busy || chosenPlayers.length !== 2} onClick={() => void showVersus()} className="primary-action px-4 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40">Mostrar VS en TV</button><button disabled={busy} onClick={() => void sendScene("WELCOME_SCREEN", { title: eventName, subtitle: eventSubtitle ?? "Game Center", message: "¡Bienvenidos!" }, { sound: { name: "welcome", volume: 0.8 } })} className="ghost-action px-4 py-3 text-xs">Bienvenida</button><button disabled={busy} onClick={() => void setAudio(!audioEnabled)} className="ghost-action px-4 py-3 text-xs">{audioEnabled ? "♪ Silenciar TV" : "♫ Activar audio"}</button></div></div>
      <aside className="panel cut p-5 md:p-7"><p className="eyebrow">Mensaje inmediato</p><h2 className="mt-2 text-2xl font-black">ANUNCIO</h2><textarea value={announcement} onChange={(event) => setAnnouncement(event.target.value)} maxLength={300} rows={5} placeholder="Ej.: En 5 minutos comienza la misión secreta" className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 p-4 text-sm outline-none transition focus:border-cyan-300/50" /><button disabled={busy || !announcement.trim()} onClick={() => void sendAnnouncement()} className="primary-action mt-3 w-full px-4 py-3 text-xs disabled:opacity-40">Enviar anuncio con sonido</button><div className="mt-5 grid grid-cols-2 gap-2"><Link href="/checkin" className="ghost-action px-3 py-3 text-center text-xs">Abrir Check-in</Link><button disabled={busy} onClick={()=>void createDisplayPairing()} className="ghost-action px-3 py-3 text-xs">Vincular Smart TV</button></div>{pairingUrl&&<div className="mt-3 rounded-lg border border-yellow-300/25 bg-yellow-300/5 p-3"><p className="text-[11px] text-yellow-100">Enlace de un solo uso. Vence en 15 minutos.</p><p className="mt-2 break-all rounded bg-black/30 p-2 font-mono text-sm font-black text-white">{pairingUrl.replace(/^https?:\/\//,"")}</p><div className="mt-2 flex gap-2"><button onClick={()=>void navigator.clipboard.writeText(pairingUrl).then(()=>setFeed("Enlace de TV copiado"))} className="ghost-action flex-1 px-3 py-2 text-xs">Copiar enlace</button><a href={pairingUrl} target="_blank" rel="noreferrer" className="primary-action flex-1 px-3 py-2 text-center text-xs">Abrir TV</a></div></div>}</aside>
    </section>
    <section className="mt-4 grid gap-4 lg:grid-cols-2"><div className="panel cut p-5"><h2 className="font-black">PRÓXIMOS EN EL CRONOGRAMA</h2><div className="mt-4 space-y-2">{schedule.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[.025] p-3"><div><b className="block text-sm">{item.title}</b><small className="text-slate-500">{new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.starts_at))}</small></div><span className="font-mono text-[10px] uppercase text-cyan-300">{item.status}</span></div>)}</div></div><div className="panel cut p-5"><h2 className="font-black">ÚLTIMAS ESCENAS</h2><div className="mt-4 space-y-2">{scenes.slice(0, 5).map((scene) => <div key={scene.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[.025] p-3"><b className="text-sm">{sceneLabel[scene.scene_type] ?? scene.scene_type}</b><span className="font-mono text-[10px] uppercase text-slate-400">{scene.status}</span></div>)}</div></div></section>
    <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-20 max-w-[90vw] -translate-x-1/2 rounded-full border border-cyan-300/25 bg-slate-950/95 px-5 py-3 text-center text-xs font-bold text-slate-200 shadow-2xl">{feed}</div>
  </div></AppShell>;
}
