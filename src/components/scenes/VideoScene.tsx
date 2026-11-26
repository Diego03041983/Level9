"use client";

import { useEffect, useRef } from "react";

interface VideoSceneProps {
  src: string;
  title: string;
  paused: boolean;
  muted: boolean;
  volume: number;
  onEnded: () => void;
  onError: (message: string) => void;
  loop?: boolean;
  showTitle?: boolean;
}

export function VideoScene({ src, title, paused, muted, volume, onEnded, onError, loop=false, showTitle=true }: VideoSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = Math.min(1, Math.max(0, volume));
  }, [muted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) {
      video.pause();
      return;
    }
    void video.play().catch((reason: unknown) => {
      onError(reason instanceof Error ? reason.message : "El televisor bloqueó la reproducción del video");
    });
  }, [onError, paused]);

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        aria-label={title}
        autoPlay
        playsInline
        preload="auto"
        loop={loop}
        disablePictureInPicture
        onEnded={onEnded}
        onError={() => onError("No se pudo cargar el video del desafío Robux")}
        className="h-full w-full object-contain"
      />
      {showTitle&&<><div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
      <p className="pointer-events-none absolute bottom-5 left-6 font-mono text-xs font-black uppercase tracking-[.22em] text-cyan-200/80">
        {title}
      </p></>}
    </div>
  );
}
