import { describe, expect, it } from "vitest";
import { playerActionSchema, scheduleCreateSchema, schedulePatchSchema } from "./schemas";

const eventId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

describe("admin validation", () => {
  it("accepts only known operational player actions", () => {
    expect(playerActionSchema.safeParse({ eventId, participantId: itemId, action: "pause" }).success).toBe(true);
    expect(playerActionSchema.safeParse({ eventId, participantId: itemId, action: "delete" }).success).toBe(false);
  });

  it("rejects agenda intervals ending before they start", () => {
    expect(scheduleCreateSchema.safeParse({ eventId, title: "Final", startsAt: "2026-11-29T18:30:00-03:00", endsAt: "2026-11-29T18:00:00-03:00" }).success).toBe(false);
  });

  it("rejects duplicate IDs in a reorder operation", () => {
    expect(schedulePatchSchema.safeParse({ operation: "reorder", eventId, orderedIds: [itemId, itemId] }).success).toBe(false);
  });
});
