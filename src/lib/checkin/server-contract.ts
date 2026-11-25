export const CHECKIN_BUCKET = "event-private";
export const CHECKIN_RPC = "register_participant_checkin";

export function isMissingCheckinRpc(message: string): boolean {
  return /register_participant_checkin|schema cache|function.*does not exist/i.test(message);
}
