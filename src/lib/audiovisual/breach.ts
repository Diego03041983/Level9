interface BreachAsset { logical_key: string | null; storage_path: string; metadata: unknown }

export function buildBreachPlayback(assets: BreachAsset[]) {
  const requireAsset = (key: string) => {
    const asset = assets.find(item => item.logical_key === key);
    if (!asset?.storage_path) throw new Error(`Falta el archivo de la intervención: ${key}`);
    return asset;
  };
  const voice = requireAsset("mission-nexus-alarm-audio");
  const analysis = requireAsset("anomaly-detected");
  const video = requireAsset("mission-glitch-video");
  const duration = (asset: BreachAsset) => {
    const metadata = asset.metadata as { durationMs?: number } | null;
    return typeof metadata?.durationMs === "number" && Number.isFinite(metadata.durationMs) ? metadata.durationMs : 0;
  };
  return {
    voicePath: voice.storage_path, analysisPath: analysis.storage_path, videoPath: video.storage_path,
    // Scheduling estimate only. Playback advances on audio ended, then video ended.
    durationMs: Math.max(6000, duration(voice) + duration(video) + 5000),
  };
}
