import { z } from "zod";

export const announcementContextSchema=z.object({
  participantIds:z.array(z.uuid()).max(8).default([]),
  title:z.string().trim().max(120).optional(),
  subtitle:z.string().trim().max(180).optional(),
  activity:z.string().trim().max(100).optional(),
  station:z.string().trim().max(100).optional(),
  round:z.string().trim().max(80).optional(),
  extra:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).optional(),
});

export const triggerAudiovisualSchema=z.object({
  eventId:z.uuid(),eventKey:z.string().regex(/^[A-Z0-9_]{2,100}$/),
  templateKey:z.string().regex(/^[A-Z0-9_]{2,80}$/).optional(),
  context:announcementContextSchema.default({participantIds:[]}),
  rehearsal:z.boolean().default(false),confirm:z.boolean().default(false),
  targetDeviceId:z.uuid().nullable().optional(),idempotencyKey:z.string().trim().min(8).max(180).optional(),
});

export const mediaRegistrationSchema=z.object({
  eventId:z.uuid(),logicalKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{1,99}$/),
  name:z.string().trim().min(2).max(120),category:z.enum(["event","players","competitions","roblox","mission","sfx","music","videos","images"]),
  characterName:z.string().trim().max(80).optional(),storagePath:z.string().min(1).max(400),
  mimeType:z.enum(["audio/wav","audio/x-wav","audio/mpeg","video/mp4","image/png","image/jpeg","image/webp"]),
  durationMs:z.number().int().min(0).max(3_600_000).default(0),volume:z.number().min(0).max(1).default(1),
});

export const playerAudioSchema=z.object({
  eventId:z.uuid(),participantId:z.uuid(),role:z.enum(["identity","welcome","name","special_intro"]),mediaAssetId:z.uuid(),
});

export const templateUpdateSchema=z.object({
  eventId:z.uuid(),templateId:z.uuid(),name:z.string().trim().min(2).max(120),
  priority:z.number().int().min(0).max(100),playPolicy:z.enum(["queue","interrupt","resume","discard_expired","replace_equivalent","confirm"]),
  postSceneType:z.string().trim().max(100).nullable().optional(),
  segments:z.array(z.object({segmentType:z.enum(["fixed_audio","participant_audio","silence","effect","music"]),config:z.record(z.string(),z.unknown()),optional:z.boolean().default(false),volume:z.number().min(0).max(1).default(1)})).max(100),
});
