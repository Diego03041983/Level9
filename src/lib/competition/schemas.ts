import { z } from "zod";

export const drawPreviewSchema = z.object({
  eventId: z.uuid(), activityId: z.uuid(), count: z.number().int().min(1).max(64),
  drawType: z.enum(["individual", "opponents", "pairs", "teams", "order", "positions", "bracket", "challenge", "custom"]),
  mode: z.enum(["random", "balanced"]), fixedIds: z.array(z.uuid()).max(64).default([]),
});

export const drawConfirmSchema = z.object({ eventId: z.uuid(), drawId: z.uuid() });

export const tournamentCreateSchema = z.object({
  eventId: z.uuid(), activityId: z.uuid(), name: z.string().trim().min(1).max(120),
  participantIds: z.array(z.uuid()).min(2).max(64),
}).refine((value) => new Set(value.participantIds).size === value.participantIds.length, {
  path: ["participantIds"], message: "No se permiten participantes duplicados",
});

export const matchResultSchema = z.object({
  eventId: z.uuid(), matchId: z.uuid(), winnerEntryId: z.uuid(),
  homeScore: z.number().int().min(0).max(99), awayScore: z.number().int().min(0).max(99),
  decidedBy: z.enum(["score", "penalties", "walkover", "abandonment", "admin"]),
  expectedVersion: z.number().int().positive(),
}).refine((value) => value.homeScore !== value.awayScore || value.decidedBy !== "score", {
  path: ["homeScore"], message: "Un resultado por goles no puede terminar empatado",
});
