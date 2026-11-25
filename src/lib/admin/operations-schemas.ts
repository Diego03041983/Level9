import { z } from "zod";

const uuid = z.uuid();
const eventId = uuid;

export const activityTypeSchema = z.enum(["fifa", "roblox", "foosball", "mission", "custom"]);
export const activityStatusSchema = z.enum(["draft", "ready", "live", "paused", "finished", "cancelled"]);
export const stationTypeSchema = z.enum(["playstation", "pc", "foosball", "mission", "other"]);
export const stationStatusSchema = z.enum(["available", "reserved", "occupied", "paused", "out_of_service"]);

export const activityRulesSchema = z.object({
  mode: z.string().trim().max(40).optional(),
  teamSize: z.number().int().min(1).max(20).optional(),
  goalsToWin: z.number().int().min(1).max(99).optional(),
  stations: z.number().int().min(1).max(20).optional(),
  durationMinutes: z.number().int().min(1).max(240).optional(),
}).strict();

const activityCreate = z.object({
  operation: z.literal("createActivity"), eventId,
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  activityType: activityTypeSchema,
  rules: activityRulesSchema,
});

const stationCreate = z.object({
  operation: z.literal("createStation"), eventId,
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(24).regex(/^[A-Z0-9-]+$/),
  stationType: stationTypeSchema,
  capacity: z.number().int().min(1).max(20),
});

const reservation = z.object({
  operation: z.literal("reserve"), eventId,
  stationId: uuid,
  participantIds: z.array(uuid).min(1).max(20),
  contextType: z.enum(["match", "challenge", "mission", "manual"]),
  contextId: uuid.nullable().optional(),
}).refine((value) => new Set(value.participantIds).size === value.participantIds.length, {
  path: ["participantIds"], message: "No se puede reservar dos veces al mismo jugador",
});

export const activityPostSchema = z.discriminatedUnion("operation", [activityCreate, stationCreate, reservation]);

export const activityPatchSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("updateActivity"), eventId, activityId: uuid,
    name: z.string().trim().min(2).max(100), status: activityStatusSchema,
    enabled: z.boolean(), rules: activityRulesSchema,
  }),
  z.object({ operation: z.literal("stationStatus"), eventId, stationId: uuid, status: stationStatusSchema }),
  z.object({ operation: z.literal("preference"), eventId, activityId: uuid, participantId: uuid, enabled: z.boolean() }),
  z.object({ operation: z.literal("release"), eventId, stationId: uuid, resolution: z.enum(["completed", "cancelled"]) }),
]);

export const activityDeleteSchema = z.object({
  eventId, resource: z.enum(["activity", "station"]), id: uuid,
});

export const teamSaveSchema = z.object({
  eventId, teamId: uuid.nullable().optional(),
  activityId: uuid.nullable().optional(),
  name: z.string().trim().min(2).max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  teamType: z.enum(["activity", "mission", "foosball", "custom"]),
  memberIds: z.array(uuid).max(20),
}).superRefine((value, context) => {
  if (new Set(value.memberIds).size !== value.memberIds.length) {
    context.addIssue({ code: "custom", path: ["memberIds"], message: "Hay integrantes repetidos" });
  }
  if (value.teamType === "foosball" && value.memberIds.length > 2) {
    context.addIssue({ code: "custom", path: ["memberIds"], message: "Un dúo de metegol admite hasta dos jugadores" });
  }
});

export const teamDeleteSchema = z.object({ eventId, teamId: uuid });

