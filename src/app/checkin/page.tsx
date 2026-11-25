"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { compressCheckinImage } from "@/lib/checkin/client-image";

type Context = { eventId: string; eventName: string; isDemo: boolean };
type Registered = { first_name?: string; gamer_tag?: string | null; player_number?: number };

export default function CheckinPage() {
  const [context, setContext] = useState<Context>();
  const [loadError, setLoadError] = useState<"auth" | "config">();
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nick, setNick] = useState("");
  const [avatar, setAvatar] = useState<"bolt" | "diamond" | "triangle">("bolt");
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Registered>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const demo = new URLSearchParams(location.search).get("mode") === "demo";
    fetch(`/api/checkin/context${demo ? "?mode=demo" : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as Context & { error?: string };
        if (!response.ok) throw { status: response.status };
        setContext(body);
      })
      .catch((reason: { status?: number }) => setLoadError(reason.status === 401 ? "auth" : "config"));
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function removePhoto() {
    setPhoto(undefined); setPreview(undefined); setConsent(false);
  }

  async function choosePhoto(file?: File) {
    if (!file) return;
    setError(undefined);
    try {
      const next = await compressCheckinImage(file);
      if (next.size > 2 * 1024 * 1024) throw new Error("La fotografía sigue superando 2 MB");
      setPhoto(next); setPreview(URL.createObjectURL(next)); setConsent(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo procesar la fotografía");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!context) return;
    setBusy(true); setError(undefined);
    const form = new FormData();
    Object.entries({ eventId: context.eventId, firstName: name, lastName, gamerTag: nick, avatarKey: avatar,
      photoConsent: String(Boolean(photo)), guardianConfirmed: String(Boolean(photo) && consent) })
      .forEach(([key, value]) => form.set(key, value));
    if (photo) form.set("photo", photo);
    try {
      const response = await fetch("/api/checkin", { method: "POST", body: form });
      const body = await response.json() as { participant?: Registered; error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo completar el registro");
      setDone(body.participant ?? { first_name: name, gamer_tag: nick || null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar el registro");
    } finally { setBusy(false); }
  }

  if (!context) return <AppShell active="checkin"><section className="mx-auto grid min-h-[72vh] max-w-xl place-items-center px-5 text-center"><div className="panel cut w-full p-10"><p className="eyebrow">Estación protegida</p><h1 className="display-title mt-4 text-4xl">{loadError === "auth" ? "Sesión requerida" : loadError === "config" ? "Check-in no disponible" : "Conectando…"}</h1><p className="mt-4 text-sm text-slate-300">{loadError === "auth" ? "Ingresá con una cuenta habilitada como check-in, operador o administrador." : loadError === "config" ? "Configurá Supabase y asociá esta cuenta al evento." : "Verificando permisos y evento…"}</p>{loadError && <Link href="/login?next=/checkin" className="primary-action mt-7 inline-block px-6 py-3">Ir al acceso seguro</Link>}</div></section></AppShell>;

  if (done) return <AppShell active="checkin"><section className="mx-auto grid min-h-[75vh] max-w-3xl place-items-center px-5 text-center"><div className="panel cut scanline w-full p-10 md:p-16"><div className="pulse-ring mx-auto grid h-28 w-28 place-items-center rounded-2xl bg-gradient-to-br from-lime-300 to-cyan-300 text-4xl font-black text-slate-950">{name.slice(0, 2).toUpperCase()}</div><p className="eyebrow mt-8 !text-lime-300">Identidad confirmada</p><h1 className="display-title mt-4 text-5xl md:text-7xl">Player unlocked</h1><p className="mt-5 text-xl text-slate-300">¡Bienvenido, <b>{done.gamer_tag || done.first_name || name}</b>!</p><p className="mt-2 font-mono text-sm text-cyan-300">+100 XP{done.player_number ? ` · JUGADOR #${String(done.player_number).padStart(2, "0")}` : ""}</p><button onClick={() => { removePhoto(); setName(""); setLastName(""); setNick(""); setDone(undefined); }} className="primary-action mt-9 px-7 py-4">Registrar otro jugador</button></div></section></AppShell>;

  const avatars = [{ key: "bolt", icon: "⚡" }, { key: "diamond", icon: "◆" }, { key: "triangle", icon: "▲" }] as const;
  return <AppShell active="checkin"><section className="mx-auto grid w-full max-w-6xl gap-8 px-5 pb-16 pt-8 md:px-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="eyebrow">{context.isDemo ? "Modo demo" : "Entrada autorizada"} · {context.eventName}</p><h1 className="display-title neon-text mt-5 text-6xl md:text-8xl">Player<br/><span className="text-cyan-300">check-in</span></h1><p className="mt-6 max-w-md leading-relaxed text-slate-300">Creá tu identidad gamer. La foto es opcional: siempre podés jugar con un avatar gráfico.</p></div>
  <form onSubmit={submit} className="panel cut p-5 md:p-8"><div className="grid gap-6 sm:grid-cols-[180px_1fr]"><div><button type="button" onClick={() => inputRef.current?.click()} className="scanline relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl border border-dashed border-cyan-300/45 bg-cyan-300/5 text-center">{preview ? <Image unoptimized fill sizes="180px" src={preview} alt="Vista previa del avatar" className="object-cover"/> : <span><b className="block text-4xl text-cyan-300">◎</b><small className="mt-3 block font-bold">CAPTURAR<br/>AVATAR</small></span>}</button><input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(event) => void choosePhoto(event.target.files?.[0])}/>{preview && <button type="button" onClick={removePhoto} className="mt-2 w-full text-xs font-bold text-red-300">Quitar fotografía</button>}</div>
  <div className="space-y-4"><Field label="Nombre del jugador *" value={name} set={setName} required max={80}/><Field label="Apellido · opcional" value={lastName} set={setLastName} max={80}/><Field label="Gamer tag · opcional" value={nick} set={setNick} max={40}/><div className="grid grid-cols-3 gap-2" aria-label="Avatar alternativo">{avatars.map(({ key, icon }) => <button key={key} type="button" aria-pressed={avatar === key} onClick={() => { setAvatar(key); removePhoto(); }} className={`ghost-action py-3 text-xl ${!photo && avatar === key ? "border-cyan-300/60 bg-cyan-300/10" : ""}`}>{icon}</button>)}</div></div></div>
  <label className="mt-6 flex items-start gap-3 rounded-lg border border-white/10 p-4 text-sm"><input disabled={!photo} checked={photo ? consent : false} onChange={(event) => setConsent(event.target.checked)} type="checkbox" className="mt-1 accent-cyan-300"/><span className="text-slate-300">{photo ? "Confirmo que el responsable autoriza esta foto exclusivamente dentro del evento." : "Avatar gráfico seleccionado. No se almacenará ninguna fotografía."}</span></label>{error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}<button disabled={!name.trim() || Boolean(photo && !consent) || busy} className="primary-action mt-5 w-full px-6 py-4 disabled:opacity-40">{busy ? "Identificando jugador…" : "Confirmar identidad →"}</button><p className="mt-3 text-center text-[11px] text-slate-500">Fotos privadas · sin URLs públicas permanentes.</p></form></section></AppShell>;
}

function Field({ label, value, set, required, max }: { label: string; value: string; set: (value: string) => void; required?: boolean; max: number }) {
  return <label className="block"><span className="eyebrow !text-[.6rem]">{label}</span><input required={required} maxLength={max} value={value} onChange={(event) => set(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/45 px-4 py-3 outline-none focus:border-cyan-300/70"/></label>;
}
