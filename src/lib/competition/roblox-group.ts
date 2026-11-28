/** Suggest a valid group without leaving a lone player when four are waiting. */
export function suggestRobloxGroup<T>(availableWaiting: T[], waitingCount: number, freePcCount: number): T[] {
  const capacity = Math.min(3, availableWaiting.length, freePcCount);
  if (capacity < 2) return [];
  const size = waitingCount === 4 ? 2 : capacity;
  return availableWaiting.slice(0, size);
}
