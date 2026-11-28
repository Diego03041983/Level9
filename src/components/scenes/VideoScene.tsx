"use client";

import {useEffect,useState} from "react";
import { SceneVideo } from "./SceneVideo";
import {GlitchVisualFallback} from "./GlitchVisualFallback";

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
  resilient?: boolean;
}

export function VideoScene({ src, title, paused, muted, volume, onPlaying, onEnded, onError, loop=false, showTitle=true, resilient=false }: VideoSceneProps) {
  const[failed,setFailed]=useState(false);
  const[playing,setPlaying]=useState(false);
  useEffect(()=>{
    if(!resilient||playing||failed||paused)return;
    const timeout=window.setTimeout(()=>{setFailed(true);onPlaying()},5000);
    return()=>window.clearTimeout(timeout);
  },[resilient,playing,failed,paused,onPlaying]);
  const started=()=>{setPlaying(true);onPlaying()};
  const videoError=(message:string)=>{if(resilient){setFailed(true);onPlaying()}else onError(message)};
  if(failed)return <GlitchVisualFallback/>;
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-black">
      <SceneVideo src={src} paused={paused} muted={muted} volume={volume} loop={loop} onPlaying={started} onEnded={onEnded} onError={videoError}/>
      {showTitle&&<><div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
      <p className="pointer-events-none absolute bottom-5 left-6 font-mono text-xs font-black uppercase tracking-[.22em] text-cyan-200/80">
        {title}
      </p></>}
    </div>
  );
}
