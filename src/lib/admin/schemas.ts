import { z } from "zod";

export const eventIdSchema = z.uuid();

export const playerActionSchema = z.object({
  eventId: z.uuid(),
  participantId: z.uuid(),
  action: z.enum(["activate", "deactivate", "withdraw", "pause", "reinstate"]),
});

export const scheduleStatusSchema = z.enum(["scheduled", "live", "paused", "finished", "cancelled"]);

export const scheduleCreateSchema = z.object({
  eventId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  activityId: z.uuid().nullable().optional(),
  sceneType: z.string().trim().max(80).nullable().optional(),
}).refine((value) => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
  path: ["endsAt"], message: "El final debe ser posterior al inicio",
});

export const schedulePatchSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("edit"), eventId: z.uuid(), itemId: z.uuid(),
    title: z.string().trim().min(1).max(120), startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).nullable(), sceneType: z.string().trim().max(80).nullable(),
  }).refine((value) => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
    path: ["endsAt"], message: "El final debe ser posterior al inicio",
  }),
  z.object({
    operation: z.literal("status"), eventId: z.uuid(), itemId: z.uuid(), status: scheduleStatusSchema,
  }),
  z.object({
    operation: z.literal("reorder"), eventId: z.uuid(), orderedIds: z.array(z.uuid()).min(1).max(100),
  }).refine((value) => new Set(value.orderedIds).size === value.orderedIds.length, {
    path: ["orderedIds"], message: "La agenda contiene elementos duplicados",
  }),
]);

export type PlayerAction = z.infer<typeof playerActionSchema>["action"];
