import { describe, expect, it } from "vitest";
import { CHECKIN_PHOTO_MAX_BYTES, checkinFieldsSchema, validateCheckinPhoto } from "./schema";

const valid = {
  eventId: "11111111-1111-4111-8111-111111111111",
  firstName: "Santiago",
  avatarKey: "bolt",
  photoConsent: false,
  guardianConfirmed: false,
};

describe("check-in validation", () => {
  it("normalizes optional empty values", () => {
    expect(checkinFieldsSchema.parse({ ...valid, lastName: "  ", gamerTag: " Pixel " })).toMatchObject({
      lastName: undefined,
      gamerTag: "Pixel",
    });
  });

  it("requires guardian confirmation whenever a photo is authorized", () => {
    const result = checkinFieldsSchema.safeParse({ ...valid, photoConsent: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["guardianConfirmed"]);
  });

  it("rejects unsupported and oversized photos", () => {
    expect(validateCheckinPhoto(new File(["x"], "avatar.gif", { type: "image/gif" }))).toMatch(/JPEG/);
    expect(
      validateCheckinPhoto(
        new File([new Uint8Array(CHECKIN_PHOTO_MAX_BYTES + 1)], "avatar.jpg", { type: "image/jpeg" }),
      ),
    ).toMatch(/2 MB/);
  });
});
