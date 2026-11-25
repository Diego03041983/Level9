import type { PlayerAction } from "./schemas";

export interface PlayerStatePatch {
  administrative_status: "active" | "inactive" | "withdrawn";
  operational_status: "available" | "resting" | "unavailable";
  arrived_at?: string;
  departed_at?: string | null;
}

export function playerTransition(action: PlayerAction, now: string): PlayerStatePatch {
  switch (action) {
    case "activate": return { administrative_status: "active", operational_status: "available", arrived_at: now, departed_at: null };
    case "deactivate": return { administrative_status: "inactive", operational_status: "unavailable" };
    case "withdraw": return { administrative_status: "withdrawn", operational_status: "unavailable", departed_at: now };
    case "pause": return { administrative_status: "active", operational_status: "resting" };
    case "reinstate": return { administrative_status: "active", operational_status: "available", departed_at: null };
  }
}

export function actionNeedsConflictCheck(action: PlayerAction) {
  return action === "deactivate" || action === "withdraw";
}

export function canApplyPlayerAction(
  action: PlayerAction,
  administrativeStatus: string,
  operationalStatus: string,
) {
  if (action === "activate") return administrativeStatus === "invited" || administrativeStatus === "inactive";
  if (action === "deactivate") return administrativeStatus === "active";
  if (action === "withdraw") return administrativeStatus !== "withdrawn";
  if (action === "pause") return administrativeStatus === "active" && !["resting", "unavailable"].includes(operationalStatus);
  return administrativeStatus === "withdrawn" || administrativeStatus === "inactive" || operationalStatus === "resting";
}
