"use client";

import { SceneVideo } from "./SceneVideo";

interface VideoSceneProps {
  src: string;
  title: string;
  paused: boolean;
  muted: boolean;
  volume: number;
  onPlaying: () => void;
  onEnded: () => void;
  onError: (message: string) => void;
  loop?: boolean;
  showTitle?: boolean;
}

export function VideoScene({ src, title, paused, muted, volume, onPlaying, onEnded, onError, loop=false, showTitle=true }: VideoSceneProps) {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-black">
      <SceneVideo src={src} paused={paused} muted={muted} volume={volume} loop={loop} onPlaying={onPlaying} onEnded={onEnded} onError={onError}/>
      {showTitle&&<><div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
      <p className="pointer-events-none absolute bottom-5 left-6 font-mono text-xs font-black uppercase tracking-[.22em] text-cyan-200/80">
        {title}
      </p></>}
    </div>
  );
}
