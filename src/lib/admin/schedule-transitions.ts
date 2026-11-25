export type ScheduleStatus = "scheduled" | "live" | "paused" | "finished" | "cancelled";

const allowed: Record<ScheduleStatus, readonly ScheduleStatus[]> = {
  scheduled: ["live", "cancelled"],
  live: ["paused", "finished", "cancelled"],
  paused: ["live", "finished", "cancelled"],
  finished: [],
  cancelled: [],
};

export function canTransitionSchedule(from: ScheduleStatus, to: ScheduleStatus) {
  return allowed[from].includes(to);
}
