export type MissionTiming = {
  status: string;
  duration_seconds: number | null;
  extension_seconds: number | null;
  started_at: string | null;
  paused_at: string | null;
  paused_seconds: number | null;
  unlocked_at: string | null;
  completed_at: string | null;
};

export function missionRemainingSeconds(mission: MissionTiming, now = Date.now()): number {
  const duration = (mission.duration_seconds ?? 1800) + (mission.extension_seconds ?? 0);
  if (!mission.started_at) return duration;
  const end = mission.status === "paused" && mission.paused_at
    ? Date.parse(mission.paused_at)
    : mission.unlocked_at ? Date.parse(mission.unlocked_at)
    : mission.completed_at ? Date.parse(mission.completed_at) : now;
  const elapsed = Math.max(0, Math.floor((end - Date.parse(mission.started_at)) / 1000) - (mission.paused_seconds ?? 0));
  return Math.max(0, duration - elapsed);
}
