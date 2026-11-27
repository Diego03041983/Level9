import { describe, expect, it } from "vitest";
import { receptionMediaSchema, receptionOperationSchema, receptionStateSchema } from "./schemas";

const eventId = "10000000-0000-4000-8000-000000000001";
const participantId = "20000000-0000-4000-8000-000000000001";

describe("NEXUS reception contracts", () => {
  it("accepts a simple preloaded guest", () => {
    const parsed = receptionOperationSchema.parse({ operation:"createGuest", eventId, guest:{ firstName:"Mateo" } });
    expect(parsed.operation).toBe("createGuest");
    if (parsed.operation === "createGuest") expect(parsed.guest.avatarKey).toBe("bolt");
  });

  it("limits CSV imports and rejects empty names", () => {
    expect(receptionOperationSchema.safeParse({operation:"importGuests",eventId,guests:[]}).success).toBe(false);
    expect(receptionOperationSchema.safeParse({operation:"createGuest",eventId,guest:{firstName:" "}}).success).toBe(false);
  });

  it("validates optimistic session controls", () => {
    expect(receptionOperationSchema.safeParse({operation:"control",eventId,sessionId:participantId,expectedVersion:2,action:"nickname",payload:{nickname:"M4TEO"}}).success).toBe(true);
    expect(receptionOperationSchema.safeParse({operation:"control",eventId,sessionId:participantId,expectedVersion:0,action:"advance"}).success).toBe(false);
  });

  it("accepts direct activation for one existing player", () => {
    expect(receptionOperationSchema.safeParse({operation:"activateGuestDirect",eventId,participantId}).success).toBe(true);
    expect(receptionOperationSchema.safeParse({operation:"activateGuestDirect",eventId,participantId:"other"}).success).toBe(false);
  });

  it("accepts only configured media bounds", () => {
    const media = receptionMediaSchema.parse({eventId,sceneKey:"IDENTITY_REVEAL",mediaKind:"audio",cueMs:"900",loop:"false",volume:"0.8",durationMs:"3200"});
    expect(media.cueMs).toBe(900);
    expect(media.volume).toBe(.8);
    expect(receptionMediaSchema.safeParse({eventId,sceneKey:"bad key",mediaKind:"video"}).success).toBe(false);
  });

  it("recognizes the complete protocol state set", () => {
    expect(receptionStateSchema.parse("PLAYER_UNLOCKED")).toBe("PLAYER_UNLOCKED");
    expect(receptionStateSchema.safeParse("FACE_RECOGNITION").success).toBe(false);
  });
});
