"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Level9Native?: {
      playVideo: (id: string, url: string, loop: boolean, muted: boolean, volume: number, paused: boolean) => void;
      updateVideo: (id: string, paused: boolean, muted: boolean, volume: number) => void;
      stopVideo: (id: string) => void;
    };
  }
}

export interface SceneVideoProps {
  src: string;
  paused: boolean;
  muted: boolean;
  volume: number;
  loop?: boolean;
  onPlaying: () => void;
  onEnded: () => void;
  onError: (message: string) => void;
  className?: string;
}

export function SceneVideo(props: SceneVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef(props);
  const nativeId = useRef("");
  useEffect(() => { callbacks.current = props; });

  useEffect(() => {
    let disposed = false;
    let lastProgress = performance.now();
    let lastTime = -1;
    const native = window.Level9Native;
    const video = videoRef.current;
    const id = `video-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    nativeId.current = id;
    const fail = (message: string) => { if (!disposed) callbacks.current.onError(message); };
    const progress = () => { lastProgress = performance.now(); };
    const playing = () => { progress(); callbacks.current.onPlaying(); };
    const ended = () => { if (!callbacks.current.loop) callbacks.current.onEnded(); };
    const nativeEvent = (event: Event) => {
      const detail = (event as CustomEvent<{id:string;type:string;message?:string}>).detail;
      if (detail?.id !== id || disposed) return;
      if (detail.type === "playing") playing();
      if (detail.type === "progress") progress();
      if (detail.type === "ended") ended();
      if (detail.type === "error") fail(detail.message ?? "Falló el reproductor Android");
    };
    const failed = () => fail(`No se pudo reproducir el video (código ${video?.error?.code ?? "desconocido"})`);
    if (native) {
      window.addEventListener("level9-video", nativeEvent);
      native.playVideo(id, new URL(props.src, location.origin).href, !!props.loop, props.muted, props.volume, props.paused);
    } else if (video) {
      video.src = props.src;
      video.muted = props.muted;
      video.volume = props.volume;
      video.loop = !!props.loop;
      video.addEventListener("playing", playing);
      video.addEventListener("ended", ended);
      video.addEventListener("error", failed);
      if (!props.paused) void video.play().catch(reason => {
        if (reason?.name !== "AbortError") fail("El navegador bloqueó el video: " + String(reason?.message ?? reason));
      });
    }
    // A stalled decoder need not raise a media error. Report it instead of trapping the queue forever.
    const watchdog = window.setInterval(() => {
      if (callbacks.current.paused) { progress(); return; }
      if (!native && video && video.currentTime !== lastTime) { lastTime = video.currentTime; progress(); }
      if ((!video?.ended || native) && performance.now() - lastProgress > 15000) {
        clearInterval(watchdog);
        fail("El video no avanzó durante 15 segundos. Revisá la conexión o el modo de reproducción de la app.");
      }
    }, 1000);
    return () => {
      disposed = true;
      clearInterval(watchdog);
      window.removeEventListener("level9-video", nativeEvent);
      if (native) native.stopVideo(id);
      if (video) {
        video.removeEventListener("playing", playing);
        video.removeEventListener("ended", ended);
        video.removeEventListener("error", failed);
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
    // A volume change must never create another decoder or restart the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.src]);

  useEffect(() => {
    if (window.Level9Native) {
      window.Level9Native.updateVideo(nativeId.current, props.paused, props.muted, props.volume);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.muted = props.muted;
    video.volume = props.volume;
    video.loop = !!props.loop;
    if (props.paused) video.pause();
    else if (video.paused && !video.ended && video.getAttribute("src")) void video.play().catch(() => undefined);
  }, [props.paused, props.muted, props.volume, props.loop]);

  return <video ref={videoRef} playsInline preload="metadata" disablePictureInPicture className={props.className ?? "h-full w-full bg-black object-contain"}/>;
}
