import { describe, expect, it } from "vitest";
import { isMissingCheckinRpc } from "./server-contract";

describe("check-in server errors", () => {
  it("recognizes a missing transactional RPC", () => {
    expect(isMissingCheckinRpc("Could not find the function public.register_participant_checkin in the schema cache")).toBe(true);
    expect(isMissingCheckinRpc("permission denied")).toBe(false);
  });
});
