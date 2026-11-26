export type ReceptionPlayback = {
  sceneId: string;
  sceneKey: string;
  status: string;
  durationMs: number | null;
  startedAt: string | null;
  pausedMs: number;
  pausedAt: string | null;
};

export function remainingPlaybackMs(playback: ReceptionPlayback, now = Date.now()) {
  if (playback.durationMs === null) return null;
  if (!playback.startedAt) return playback.durationMs;
  if (["played", "skipped", "failed", "expired", "cancelled"].includes(playback.status)) return 0;
  const startedAt = Date.parse(playback.startedAt);
  if (!Number.isFinite(startedAt)) return playback.durationMs;
  const pausedAt = playback.pausedAt ? Date.parse(playback.pausedAt) : NaN;
  const currentPauseMs = Number.isFinite(pausedAt) ? Math.max(0, now - pausedAt) : 0;
  const elapsed = Math.max(0, now - startedAt - playback.pausedMs - currentPauseMs);
  return Math.max(0, playback.durationMs - elapsed);
}

export function formatPlaybackClock(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function assignmentDurationMs(value: { media_assets: { metadata?: Record<string, unknown> } | { metadata?: Record<string, unknown> }[] | null }) {
  const asset = Array.isArray(value.media_assets) ? value.media_assets[0] : value.media_assets;
  const duration = Number(asset?.metadata?.durationMs);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function formatDurationSeconds(milliseconds: number) {
  if (milliseconds <= 0) return "Duración no disponible";
  const seconds = Math.round(milliseconds / 100) / 10;
  return `Duración: ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(seconds)} segundos`;
}
