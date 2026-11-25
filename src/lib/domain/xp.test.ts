import { describe, expect, it } from "vitest";
import { addXpTransaction, createXpLedger, xpBalance } from "./xp";

describe("XP ledger", () => {
  it("credits an idempotency key once", () => {
    const transaction = {
      id: "tx-1",
      participantId: "p1",
      amount: 100,
      reason: "Player check-in",
      idempotencyKey: "checkin:p1",
      createdAt: "2026-11-25T16:00:00.000Z",
    };
    const once = addXpTransaction(createXpLedger(), transaction);
    const twice = addXpTransaction(once, { ...transaction, id: "tx-2" });
    expect(twice).toBe(once);
    expect(xpBalance(twice, "p1")).toBe(100);
  });

  it("supports auditable negative adjustments", () => {
    const ledger = addXpTransaction(createXpLedger(), {
      id: "adjustment",
      participantId: "p1",
      amount: -50,
      reason: "Administrator correction",
      idempotencyKey: "adjustment:1",
      createdAt: "2026-11-25T16:00:00.000Z",
    });
    expect(xpBalance(ledger, "p1")).toBe(-50);
  });
});
