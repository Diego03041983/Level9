export interface VoicePosition { time: number; duration: number }

export function breachIntensity({ time, duration }: VoicePosition) {
  const progress = Number.isFinite(time) && Number.isFinite(duration) && duration > 0
    ? Math.min(1, Math.max(0, time / duration)) : 0;
  return { progress, strength: .12 + .88 * progress ** 1.35, collapse: Math.max(0, (progress - .975) / .025) };
}
