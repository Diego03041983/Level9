"use client";

import { NexusStandby } from "@/components/tv/NexusStandby";
import { SceneVideo } from "./SceneVideo";
import "./BreachSequence.css";
import type { VoicePosition } from "@/lib/tv/breach-intensity";

export interface BreachPlayback {
  video: boolean;
  error?: string;
  attempt: number;
  retry: () => void;
  getPosition: () => VoicePosition;
}

export function BreachSequence({ src, playback, paused, muted, volume, getSpeechLevel, onPlaying, onEnded, onError }: {
  src?: string; playback: BreachPlayback; paused: boolean; muted: boolean; volume: number;
  getSpeechLevel?: () => number; onPlaying: () => void; onEnded: () => void; onError: (message: string) => void;
}) {
  if (playback.video && src && !playback.error) return <SceneVideo key={playback.attempt} src={src} paused={paused} muted={muted} volume={volume} onPlaying={onPlaying} onEnded={onEnded} onError={onError} stallTimeoutMs={45000} />;
  return <div className={`nexus-breach ${paused || playback.error ? "nexus-breach-paused" : ""}`} data-breach-phase="nexus">
    <div className="nexus-breach-transmission"><NexusStandby speaking={!playback.error} getSpeechLevel={playback.error ? undefined : getSpeechLevel} getInterferencePosition={playback.getPosition} /></div>
    <div className="nexus-breach-noise" aria-hidden="true" />
    <div className="nexus-breach-band" aria-hidden="true" />
    <div className="nexus-breach-vignette" aria-hidden="true" />
    {playback.error && <div role="alert" className="nexus-breach-error">
      <p>La reproducción se detuvo</p><small>{playback.error}</small>
      <button className="primary-action mt-4 px-6 py-3" onClick={playback.retry}>Reintentar {playback.video ? "Glitch" : "NEXUS"}</button>
    </div>}
  </div>;
}
