"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AppShell } from "@/components/ui/AppShell";
import { SceneRenderer } from "@/components/scenes/SceneRenderer";
import { useAudioEngine } from "@/components/audio/useAudioEngine";
import { compareDisplaySceneOrder, normalizeScene, PROCESSED_STORAGE_KEY, queueDisplayScene, shouldAcceptScene, type DisplayScene, type DisplayPlaybackQueue } from "@/lib/tv/protocol";
import { useDisplayConnection } from "@/lib/tv/useDisplayConnection";
import type { SceneEventRow } from "@/types/database";

type Ack = (id:string,status:"received"|"started"|"completed"|"failed"|"skipped",error?:string)=>Promise<boolean>;


export default function TvPage(){
  const [started,setStarted]=useState(false);const [{current,pending},setPlaybackQueue]=useState<DisplayPlaybackQueue>({current:null,pending:[]});
  const [playbackPaused,setPlaybackPaused]=useState(false);const [skipSignal,setSkipSignal]=useState(0);const [updateAvailable,setUpdateAvailable]=useState(false);const [readySceneId,setReadySceneId]=useState("");const [playingSceneId,setPlayingSceneId]=useState("");const [videoEndedSceneId,setVideoEndedSceneId]=useState("");const [audioEndedSceneId,setAudioEndedSceneId]=useState("");
  const processed=useRef(new Set<string>());const latestNexusScene=useRef(new Map<string,DisplayScene>());const finishing=useRef(new Set<string>());const loadedVersion=useRef("");const deviceId=useRef("");const ackRef=useRef<Ack>(async()=>false);const playedScene=useRef("");const handledSkip=useRef(0);const sceneTimer=useRef({sceneId:"",remainingMs:0});
  const audio=useAudioEngine();
  const accept=useCallback((row:SceneEventRow)=>{const scene=normalizeScene(row);if(!deviceId.current||!shouldAcceptScene(scene,deviceId.current,processed.current))return;const nexusSession=scene.scene_type.toUpperCase().startsWith("NEXUS_")?scene.payload.sessionId:undefined;if(nexusSession){const latest=latestNexusScene.current.get(nexusSession);if(latest&&compareDisplaySceneOrder(scene,latest)<=0){processed.current.add(scene.id);localStorage.setItem(PROCESSED_STORAGE_KEY,JSON.stringify([...processed.current].slice(-200)));return}if(latest)processed.current.add(latest.id);latestNexusScene.current.set(nexusSession,scene)}void ackRef.current(scene.id,"received");if(scene.scene_type.toUpperCase()==="DISPLAY_COMMAND"&&scene.payload.action){void ackRef.current(scene.id,"started");if(scene.payload.action==="pause")setPlaybackPaused(true);if(scene.payload.action==="resume")setPlaybackPaused(false);if(scene.payload.action==="skip")setSkipSignal(value=>value+1);if(scene.payload.action==="clear_queue")setPlaybackQueue(state=>({...state,pending:[]}));if(scene.payload.action==="stop"||scene.payload.action==="home"){setPlaybackQueue(state=>({...state,pending:[]}));setSkipSignal(value=>value+1)}processed.current.add(scene.id);localStorage.setItem(PROCESSED_STORAGE_KEY,JSON.stringify([...processed.current].slice(-200)));void ackRef.current(scene.id,"completed");return}setPlaybackQueue(state=>queueDisplayScene(state,scene))},[]);
  const connection=useDisplayConnection(accept);
  const {acknowledge,heartbeat,pairing}=connection;const {pause,resume,playScene,setMuted,setVolume,stop,unlock,muted}=audio;
  const finishScene=useCallback((scene:DisplayScene,status:"completed"|"failed"|"skipped",error?:string)=>{if(finishing.current.has(scene.id))return;finishing.current.add(scene.id);void acknowledge(scene.id,status,error);processed.current.add(scene.id);playedScene.current="";sceneTimer.current={sceneId:"",remainingMs:0};localStorage.setItem(PROCESSED_STORAGE_KEY,JSON.stringify([...processed.current].slice(-200)));setPlaybackQueue(state=>{if(state.current?.id!==scene.id)return state;const [next,...pendingScenes]=state.pending;if(!next)stop();return{current:next??null,pending:pendingScenes}})},[acknowledge,stop]);
  useEffect(()=>{deviceId.current=pairing?.deviceId??"";ackRef.current=acknowledge},[acknowledge,pairing]);

  useEffect(()=>{try{const ids=JSON.parse(localStorage.getItem(PROCESSED_STORAGE_KEY)??"[]") as unknown;if(Array.isArray(ids))processed.current=new Set(ids.filter((id):id is string=>typeof id==="string").slice(-200))}catch{/* corrupt local state is safely ignored */}},[]);
  useEffect(()=>{let cancelled=false;const check=async()=>{try{const response=await fetch("/api/version",{cache:"no-store"});if(!response.ok)return;const data=await response.json() as {version?:unknown};if(cancelled||typeof data.version!=="string"||!data.version)return;if(!loadedVersion.current){loadedVersion.current=data.version;return}if(loadedVersion.current!==data.version)setUpdateAvailable(true)}catch{/* keep the current display running while offline */}};void check();const interval=window.setInterval(()=>void check(),30_000);return()=>{cancelled=true;clearInterval(interval)}},[]);
  useEffect(()=>{if(updateAvailable&&!current)location.reload()},[current,updateAvailable]);
  useEffect(()=>{if(playbackPaused){pause();return}void resume().catch(()=>undefined)},[pause,playbackPaused,resume]);
  const beginPlayback=useCallback(()=>{
    if(!current||playedScene.current===current.id)return;
    playedScene.current=current.id;
    setPlayingSceneId(current.id);
    void playScene(current).then(()=>{
      if(playedScene.current===current.id)setAudioEndedSceneId(current.id);
    }).catch((reason:unknown)=>{
      // Changing stage intentionally cancels the previous pending audio.play().
      if(playedScene.current!==current.id||(reason instanceof Error&&reason.name==="AbortError"))return;
      setAudioEndedSceneId(current.id);
      void acknowledge(current.id,"failed",reason instanceof Error?reason.message:"Audio playback failed");
    });
    void acknowledge(current.id,"started");
  },[acknowledge,current,playScene]);
  useEffect(()=>{
    if(!started||!current)return;
    stop();
    playedScene.current="";
    if(current.scene_type.toUpperCase()==="AUDIO_CONTROL"){
      if(typeof current.payload.enabled==="boolean")setMuted(!current.payload.enabled);
      if(typeof current.payload.volume==="number")setVolume(current.payload.volume);
    }
    // Mount the single real player immediately. Audio starts on its first playing event.
    let cancelled=false;
    queueMicrotask(()=>{if(cancelled)return;setReadySceneId(current.id);if(!current.payload.videoUrl)beginPlayback()});
    return ()=>{cancelled=true;stop()};
    // Scene identity owns the player lifecycle, not volume or pause changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[current?.id,started]);

  useEffect(()=>{if(!started||!current||readySceneId!==current.id)return;const skipping=skipSignal>handledSkip.current;if(skipping){handledSkip.current=skipSignal;finishScene(current,"skipped");return}if(current.payload.videoUrl&&(!current.payload.videoLoop||playingSceneId!==current.id))return;if(sceneTimer.current.sceneId!==current.id)sceneTimer.current={sceneId:current.id,remainingMs:current.duration_ms??10_000};if(playbackPaused)return;const beganAt=Date.now();const timer=window.setTimeout(()=>finishScene(current,"completed"),sceneTimer.current.remainingMs);return()=>{clearTimeout(timer);if(sceneTimer.current.sceneId===current.id)sceneTimer.current.remainingMs=Math.max(0,sceneTimer.current.remainingMs-(Date.now()-beganAt))}},[current,finishScene,playbackPaused,playingSceneId,readySceneId,skipSignal,started]);
  useEffect(()=>{if(!started||!pairing)return;void heartbeat(!muted);const interval=window.setInterval(()=>void heartbeat(!muted),15_000);return()=>clearInterval(interval)},[heartbeat,muted,pairing,started]);
  const start=useCallback(async()=>{try{await unlock();setStarted(true)}catch{setStarted(true)}},[unlock]);
  const finishVideo=useCallback(()=>{if(current)setVideoEndedSceneId(current.id)},[current]);
  useEffect(()=>{
    if(!current||current.payload.videoLoop||videoEndedSceneId!==current.id)return;
    // A WAV can continue after the last MP4 frame. Keep that frame visible until both end.
    if(audioEndedSceneId!==current.id){
      const watchdog=window.setTimeout(()=>setAudioEndedSceneId(current.id),30_000);
      return()=>clearTimeout(watchdog);
    }
    const timer=window.setTimeout(()=>finishScene(current,"completed"),pending.length?600:5000);
    return()=>clearTimeout(timer);
  },[audioEndedSceneId,current,finishScene,pending.length,videoEndedSceneId]);
  const failVideo=useCallback((message:string)=>{if(current)finishScene(current,"failed",message)},[current,finishScene]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.key==="Enter"||event.key===" ")&&!started&&pairing)void start();if(event.key.toLowerCase()==="m")setMuted(!muted)};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[muted,pairing,setMuted,start,started]);

  if(connection.status==="unpaired"||connection.status==="revoked")return <AppShell compact><section className="grid h-dvh place-items-center px-6 text-center"><div className="panel cut max-w-xl p-10"><div className="mx-auto grid h-24 w-24 place-items-center rounded-2xl border border-yellow-300/40 bg-yellow-300/5 text-4xl text-yellow-300">⌁</div><p className="eyebrow mt-8 !text-yellow-300">Pantalla sin vincular</p><h1 className="display-title mt-4 text-5xl">Pairing requerido</h1><p className="mt-5 leading-relaxed text-slate-300">{connection.status==="revoked"?"La sesión de esta pantalla expiró o fue revocada.":"Autorizá este televisor desde Administración → Pantalla. El vínculo temporal no se puede reemplazar por un código administrativo compartido."}</p>{connection.status==="revoked"&&<button onClick={connection.forgetPairing} className="ghost-action mt-7 px-5 py-3">Eliminar vínculo vencido</button>}<p className="mt-6 font-mono text-[10px] tracking-[.15em] text-slate-600">DISPLAY · NOT AUTHORIZED</p></div></section></AppShell>;
  if(connection.status==="config_missing")return <AppShell compact><section className="grid h-dvh place-items-center px-6 text-center"><div><p className="eyebrow !text-red-300">Configuración incompleta</p><h1 className="display-title mt-5 text-5xl">Supabase no disponible</h1><p className="mt-5 text-slate-400">Configurá las variables públicas de Supabase y reiniciá la aplicación.</p></div></section></AppShell>;
  if(!started)return <AppShell active="tv" compact><section className="grid h-dvh place-items-center px-6 text-center"><div><div className="pulse-ring relative mx-auto h-40 w-40 overflow-hidden rounded-3xl border border-cyan-300/60 shadow-[0_0_55px_rgba(0,217,255,.28)]"><Image src="/assets/branding/santiago-gamer.png" alt="Santiago gamer" fill sizes="160px" className="object-cover" priority/></div><p className="eyebrow mt-10">Pantalla vinculada · {connection.status}</p><h1 className="display-title neon-text mt-5 text-[clamp(4rem,12vw,9rem)]">Press start</h1><p className="mx-auto mt-5 max-w-lg text-slate-400">Presioná Enter, OK o el botón para habilitar los archivos de audio del evento y comenzar.</p><button disabled={!audio.ready} onClick={()=>void start()} className="primary-action mt-8 px-10 py-5 text-lg disabled:opacity-40">{audio.ready?"Habilitar audio e iniciar":"Cargando audio…"}</button>{audio.error&&<p className="mt-4 text-sm text-red-300">{audio.error}</p>}<p className="mt-5 font-mono text-[10px] tracking-[.18em] text-slate-600">{connection.status.toUpperCase()} · {connection.pendingCount} ESCENAS RECUPERADAS</p></div></section></AppShell>;
  return <AppShell compact><section className="relative h-dvh min-h-[500px] overflow-hidden">{current&&readySceneId===current.id?<SceneRenderer key={current.id} scene={current} onVideoPlaying={beginPlayback} videoPaused={playbackPaused} videoMuted={audio.muted} videoVolume={audio.volume} onVideoEnded={finishVideo} onVideoError={failVideo}/>:current?<div aria-label="Preparando contenido" className="h-full bg-[#080e24]"/>:<div className="grid h-full place-items-center px-10 text-center"><div><span className="float relative mx-auto block h-40 w-40 overflow-hidden rounded-3xl border border-cyan-300/50 shadow-[0_0_45px_rgba(0,217,255,.22)]"><Image src="/assets/branding/santiago-gamer.png" alt="Santiago gamer" fill sizes="160px" className="object-cover" priority/></span><p className="eyebrow mt-8">Pantalla vinculada</p><h2 className="display-title neon-text mt-5 text-[clamp(3rem,8vw,7rem)]">Game center</h2><p className="mt-5 text-xl text-slate-400">Esperando la próxima escena del centro de control</p></div></div>}
  <div className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/80 p-2"><span title={`Conexión ${connection.status}`} className={`h-2 w-2 rounded-full ${connection.status==="realtime"?"bg-lime-300 shadow-[0_0_8px_#a3ff12]":connection.status==="polling"?"bg-yellow-300":"bg-red-400"}`}/><span className="px-1 font-mono text-[9px] uppercase text-slate-400">{connection.status} · {pending.length} en cola</span><button onClick={()=>audio.setMuted(!audio.muted)} className="ghost-action px-3 py-2 text-xs">{audio.muted?"Activar audio":"Silenciar"}</button><label className="sr-only" htmlFor="tv-volume">Volumen</label><input id="tv-volume" aria-label="Volumen" type="range" min="0" max="1" step="0.05" value={audio.volume} onChange={event=>audio.setVolume(Number(event.target.value))} className="w-20 accent-cyan-300"/><button onClick={()=>void document.documentElement.requestFullscreen?.()} className="ghost-action px-3 py-2 text-xs">Pantalla completa</button></div></section></AppShell>;
}
