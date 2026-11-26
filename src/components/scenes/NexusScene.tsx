"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { DisplayScene } from "@/lib/tv/protocol";
import { shouldMuteNexusVideo } from "./nexusVideoAudio";

const titles:Record<string,string>={
  DETECTION:"JUGADOR DETECTADO",SCANNING:"ESCANEANDO IDENTIDAD",IDENTITY_REVEAL:"IDENTIDAD CONFIRMADA",
  NICKNAME_REQUEST:"IDENTIDAD GAMER REQUERIDA",WAITING_NICKNAME:"ESPERANDO NICKNAME",NICKNAME_CONFIRMED:"NICKNAME REGISTRADO",
  PHOTO_REQUEST:"CAPTURA DE AVATAR",PHOTO_COUNTDOWN:"PREPARANDO CÁMARA",WAITING_PHOTO:"ESPERANDO FOTOGRAFÍA",
  AVATAR_PROCESSING:"PROCESANDO AVATAR",GAMER_CALIBRATION:"CALIBRACIÓN GAMER",PLAYER_UNLOCKED:"JUGADOR DESBLOQUEADO",
  NEXUS_SYSTEM_BREACH:"ANOMALÍA DETECTADA",
};

export function NexusScene({scene,paused,muted,volume,onEnded}:{scene:DisplayScene;paused:boolean;muted:boolean;volume:number;onEnded:()=>void}){
  const videoRef=useRef<HTMLVideoElement>(null);const [failedVideoUrl,setFailedVideoUrl]=useState<string>();const payload=scene.payload;const state=(payload.state??scene.scene_type.replace(/^NEXUS_/,"")).toUpperCase();
  const videoMuted=shouldMuteNexusVideo(scene,muted);
  useEffect(()=>{const video=videoRef.current;if(!video)return;video.muted=videoMuted;video.volume=Math.min(1,Math.max(0,volume))},[videoMuted,volume]);
  useEffect(()=>{const video=videoRef.current;if(!video)return;if(paused)video.pause();else void video.play().catch(()=>setFailedVideoUrl(payload.videoUrl))},[paused,payload.videoUrl]);
  const showIdentity=["IDENTITY_REVEAL","NICKNAME_CONFIRMED","PLAYER_UNLOCKED"].includes(state);
  const showPhoto=["AVATAR_PROCESSING","GAMER_CALIBRATION","PLAYER_UNLOCKED"].includes(state)&&payload.photoUrl;
  if(payload.videoUrl!==undefined&&payload.videoUrl!==failedVideoUrl)return <video ref={videoRef} src={payload.videoUrl} autoPlay muted={videoMuted} playsInline preload="auto" loop={payload.videoLoop} onEnded={()=>{if(!payload.videoLoop)onEnded()}} onError={()=>setFailedVideoUrl(payload.videoUrl)} className="h-full w-full bg-black object-cover"/>;
  return <div className="relative h-full w-full overflow-hidden bg-[#080e24] text-center">
    <NexusCore speaking={Boolean(scene.sound.url)}/><div className="absolute inset-0 bg-[radial-gradient(circle,transparent_25%,rgba(8,14,36,.55)_100%)]"/>
    <div className="relative z-10 grid h-full place-items-center px-[5vw] py-[5vh]"><div className="w-full max-w-6xl"><p className="eyebrow">NEXUS-9 · PLAYER ACTIVATION PROTOCOL</p>
      {showPhoto&&<div className="relative mx-auto mt-5 h-[clamp(13rem,34vh,24rem)] w-[clamp(13rem,34vh,24rem)] overflow-hidden rounded-[2rem] border-4 border-cyan-300 shadow-[0_0_60px_rgba(0,217,255,.4)]"><Image unoptimized fill sizes="34vh" src={payload.photoUrl!} alt={`Avatar de ${payload.firstName??"jugador"}`} className="object-cover"/></div>}
      <h1 className="display-title neon-text mt-7 text-[clamp(3rem,8vw,8rem)] text-white">{titles[state]??state.replaceAll("_"," ")}</h1>
      {state==="SCANNING"&&<div className="mx-auto mt-8 h-3 max-w-3xl overflow-hidden rounded-full bg-white/10"><i className="block h-full w-2/3 animate-pulse bg-gradient-to-r from-cyan-300 to-lime-300 shadow-[0_0_24px_#00d9ff]"/></div>}
      {showIdentity&&<p className="mt-6 text-[clamp(2rem,4vw,4rem)] font-black text-cyan-200">{payload.gamerTag||payload.firstName} <small className="font-mono text-[.45em] text-lime-300">#{payload.playerNumber}</small></p>}
      {state==="GAMER_CALIBRATION"&&<div className="mx-auto mt-7 grid max-w-4xl gap-3 sm:grid-cols-5">{["Velocidad","Creatividad","Estrategia","Equipo","Energía"].map((label,index)=><div key={label} className="rounded-lg border border-cyan-300/20 bg-black/25 p-3"><b className="text-xs text-cyan-100">{label}</b><div className="mt-2 h-2 rounded bg-white/10"><i className="block h-full rounded bg-lime-300" style={{width:`${88+index*2}%`}}/></div></div>)}</div>}
      {payload.isCelebrant&&state==="PLAYER_UNLOCKED"&&<p className="mt-4 text-2xl font-black text-yellow-300">★ PROTAGONISTA DEL EVENTO · LEVEL 9</p>}
      {state==="PLAYER_UNLOCKED"&&<p className="mt-4 font-mono text-xl font-black text-lime-300">ACCESO CONCEDIDO · +100 XP</p>}
      {["WAITING_NICKNAME","WAITING_PHOTO"].includes(state)&&<p className="mt-6 text-xl font-bold tracking-[.16em] text-slate-300">ESPERANDO CONFIRMACIÓN DEL OPERADOR</p>}
    </div></div>
  </div>;
}

function NexusCore({speaking}:{speaking:boolean}){return <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle,rgba(0,217,255,.16),transparent_55%)]"><div className={`relative h-[42vh] w-[42vh] rounded-full border border-cyan-300/50 ${speaking?"animate-pulse":"float"}`}><i className="absolute inset-[12%] rounded-full border-2 border-lime-300/50 [transform:rotateX(65deg)]"/><i className="absolute inset-[22%] rounded-full border-2 border-violet-300/50 [transform:rotateY(65deg)]"/><i className="absolute inset-[34%] rounded-full bg-cyan-300 shadow-[0_0_80px_#00d9ff]"/></div></div>}
