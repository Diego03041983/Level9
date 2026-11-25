"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SetupState = { error?: string };

const setupSchema = z.object({
  eventName: z.string().trim().min(3).max(120),
  subtitle: z.string().trim().max(160),
  celebrantName: z.string().trim().min(1).max(80),
  celebrantAge: z.coerce.number().int().min(1).max(120),
  startsAt: z.iso.datetime({ local: true }),
  endsAt: z.iso.datetime({ local: true }),
});

export async function setupEvent(_state: SetupState, formData: FormData): Promise<SetupState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre, la edad y los horarios del evento." };
  const startsAt = new Date(`${parsed.data.startsAt}:00-03:00`);
  const endsAt = new Date(`${parsed.data.endsAt}:00-03:00`);
  if (endsAt <= startsAt) return { error: "El horario de cierre debe ser posterior al inicio." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "La sesión venció. Volvé a ingresar." };
  const { data, error } = await supabase.rpc("bootstrap_event", {
    event_name: parsed.data.eventName,
    celebrant_name: parsed.data.celebrantName,
    celebrant_age: parsed.data.celebrantAge,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    event_timezone: "America/Argentina/Cordoba",
    event_subtitle: parsed.data.subtitle,
    demo: false,
  });
  if (error) return { error: error.message.includes("already owns") ? "Esta cuenta ya tiene un evento asignado." : "No se pudo crear el evento en Supabase." };
  const created = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  if (!created?.id) return { error: "El evento se creó sin un identificador válido." };
  const eventId = created.id;
  const activityRows = [
    { event_id: eventId, slug: "fifa", name: "FIFA LEGENDS CUP", activity_type: "fifa", status: "ready", rules: { format: "single_elimination", matchMinutes: 6 } },
    { event_id: eventId, slug: "roblox", name: "ROBLOX QUEST ARENA", activity_type: "roblox", status: "ready", rules: { stations: 3 } },
    { event_id: eventId, slug: "metegol", name: "METEGOL DUO CUP", activity_type: "foosball", status: "ready", rules: { teamSize: 2, goalsToWin: 5 } },
    { event_id: eventId, slug: "mission", name: "MISIÓN ROBUX SECRETA", activity_type: "mission", status: "ready", rules: { teamSizes: [4, 4, 3, 3] } },
  ];
  const stationRows = [
    ["PS-01", "PlayStation 01", "playstation", 2], ["PC-01", "PC Gaming 01", "pc", 1], ["PC-02", "PC Gaming 02", "pc", 1],
    ["PC-03", "PC Gaming 03", "pc", 1], ["MET-01", "Metegol 01", "foosball", 4],
  ].map(([code, name, station_type, capacity]) => ({ event_id: eventId, code, name, station_type, capacity }));
  const scheduleConfig = [
    ["Recepción y registro", 0, 15, "WELCOME_SCREEN"], ["Apertura de competencias", 15, 75, "EVENT_INTRO"],
    ["Comida y descanso", 75, 95, "FOOD_BREAK"], ["Continuación de actividades", 95, 120, "STATION_STATUS"],
    ["Misión Robux secreta", 120, 150, "MISSION_ALERT"], ["Finales", 150, 165, "TOURNAMENT_BRACKET"],
    ["Torta y premiación", 165, 180, "BIRTHDAY_CAKE"],
  ] as const;
  const scheduleRows = scheduleConfig.map(([title, from, to, scene_type], index) => ({ event_id: eventId, title, starts_at: new Date(startsAt.getTime() + from * 60_000).toISOString(), ends_at: new Date(startsAt.getTime() + to * 60_000).toISOString(), position: index + 1, scene_type }));
  const achievementRows = ["FIFA LEGEND", "ROBLOX MASTER", "DUO CHAMPION", "TREASURE HUNTER", "TEAM PLAYER", "GAMER LEVEL 9"].map((name) => ({ event_id: eventId, code: name.replaceAll(" ", "_"), name }));
  const results = await Promise.all([
    supabase.from("activities").insert(activityRows), supabase.from("stations").insert(stationRows),
    supabase.from("schedule_items").insert(scheduleRows), supabase.from("achievements").insert(achievementRows),
    supabase.from("events").update({ status: "ready" }).eq("id", eventId),
  ]);
  if (results.some((result) => result.error)) return { error: "El evento se creó, pero parte de la configuración inicial no pudo guardarse. Ingresá nuevamente para completarla." };
  redirect("/admin");
}
