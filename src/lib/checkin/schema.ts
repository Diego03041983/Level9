import { z } from "zod";

export const CHECKIN_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const CHECKIN_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

export const checkinFieldsSchema = z
  .object({
    eventId: z.uuid(),
    participantId: z.uuid().optional(),
    firstName: z.string().trim().min(1, "Ingresá el nombre del jugador").max(80),
    lastName: optionalText(80),
    gamerTag: optionalText(40),
    avatarKey: z.enum(["bolt", "diamond", "triangle"]).default("bolt"),
    photoConsent: z.boolean(),
    guardianConfirmed: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.photoConsent && !value.guardianConfirmed) {
      context.addIssue({
        code: "custom",
        path: ["guardianConfirmed"],
        message: "Un responsable debe confirmar la autorización de la fotografía",
      });
    }
  });

export type CheckinFields = z.infer<typeof checkinFieldsSchema>;

export function validateCheckinPhoto(file: File | null): string | null {
  if (!file || file.size === 0) return null;
  if (!(CHECKIN_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return "La foto debe ser JPEG, PNG o WebP";
  }
  if (file.size > CHECKIN_PHOTO_MAX_BYTES) {
    return "La foto supera el límite de 2 MB";
  }
  return null;
}
