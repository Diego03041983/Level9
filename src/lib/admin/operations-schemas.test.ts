import { describe, expect, it } from "vitest";
import { activityPatchSchema, activityPostSchema, teamSaveSchema } from "./operations-schemas";

const eventId = "10000000-0000-4000-8000-000000000001";
const first = "20000000-0000-4000-8000-000000000001";
const second = "20000000-0000-4000-8000-000000000002";
const third = "20000000-0000-4000-8000-000000000003";

describe("activity operation schemas", () => {
  it("accepts a configured Roblox activity", () => {
    const result = activityPostSchema.safeParse({ operation: "createActivity", eventId, name: "Quest Arena",
      slug: "quest-arena", activityType: "roblox", rules: { stations: 3, durationMinutes: 8 } });
    expect(result.success).toBe(true);
  });

  it("rejects invalid station capacity and duplicate reservations", () => {
    expect(activityPostSchema.safeParse({ operation: "createStation", eventId, name: "PC 1", code: "PC-1",
      stationType: "pc", capacity: 0 }).success).toBe(false);
    expect(activityPostSchema.safeParse({ operation: "reserve", eventId, stationId: first,
      participantIds: [second, second], contextType: "manual" }).success).toBe(false);
  });

  it("accepts explicit out-of-service station transitions", () => {
    expect(activityPatchSchema.safeParse({ operation: "stationStatus", eventId, stationId: first,
      status: "out_of_service" }).success).toBe(true);
  });
});

describe("team operation schemas", () => {
  it("enforces unique members and duo capacity", () => {
    expect(teamSaveSchema.safeParse({ eventId, name: "Pixel", color: "#00D9FF", teamType: "foosball",
      activityId: first, memberIds: [second, second] }).success).toBe(false);
    expect(teamSaveSchema.safeParse({ eventId, name: "Pixel", color: "#00D9FF", teamType: "foosball",
      activityId: first, memberIds: [first, second, third] }).success).toBe(false);
  });

  it("accepts a two-player foosball team", () => {
    expect(teamSaveSchema.safeParse({ eventId, name: "Pixel", color: "#00D9FF", teamType: "foosball",
      activityId: first, memberIds: [second, third] }).success).toBe(true);
  });
});

