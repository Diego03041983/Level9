import { z } from "zod";
import { receptionStates } from "./constants";

const uuid = z.uuid();
const guest = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  isCelebrant: z.boolean().optional().default(false),
  avatarKey: z.enum(["bolt", "diamond", "triangle"]).optional().default("bolt"),
});

export const receptionOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("createGuest"), eventId: uuid, guest }),
  z.object({ operation: z.literal("importGuests"), eventId: uuid, guests: z.array(guest).min(1).max(200) }),
  z.object({ operation: z.literal("updateGuest"), eventId: uuid, participantId: uuid, guest }),
  z.object({ operation: z.literal("cancelGuest"), eventId: uuid, participantId: uuid }),
  z.object({ operation: z.literal("activateGuestDirect"), eventId: uuid, participantId: uuid }),
  z.object({ operation: z.literal("resetActivatedGuests"), eventId: uuid }),
  z.object({ operation: z.literal("start"), eventId: uuid, participantId: uuid, displayDeviceId: uuid.nullable(), mode: z.enum(["full", "quick", "demo"]).default("full") }),
  z.object({
    operation: z.literal("control"), eventId: uuid, sessionId: uuid, expectedVersion: z.number().int().positive(),
    action: z.enum(["advance", "nickname", "pause", "resume", "repeat", "cancel", "complete"]),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
  }),
]);

export const receptionMediaSchema = z.object({
  eventId: uuid,
  participantId: z.union([uuid, z.literal("")]).optional(),
  sceneKey: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  mediaKind: z.enum(["video", "audio"]),
  cueMs: z.coerce.number().int().min(0).max(600000).default(0),
  loop: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  volume: z.coerce.number().min(0).max(1).default(1),
  durationMs: z.coerce.number().int().min(0).max(600000).default(0),
});

export const receptionStateSchema = z.enum(receptionStates);

