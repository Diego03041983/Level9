"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sceneUsesNexusFace, sceneIsBreachSequence, type DisplayScene } from "@/lib/tv/protocol";
import { SpeechEnvelopeReader } from "@/lib/tv/speech-envelope";

interface AudioAsset { name: string; type: "sfx" | "music" | "voice"; volume: number; loop: boolean }
interface Manifest { assets: AudioAsset[] }

const defaults: Record<string, string> = {
  EVENT_INTRO: "intro", WELCOME_SCREEN: "intro", PLAYER_UNLOCKED: "player-unlocked", PLAYER_WELCOME: "player-unlocked", PLAYER_DRAW: "roulette-loop", TEAM_DRAW: "team-selected",
  VERSUS: "versus-impact", VERSUS_SCREEN: "versus-impact", DUO_VERSUS_SCREEN: "versus-impact", ANNOUNCEMENT: "notification", MATCH_COUNTDOWN: "countdown-tick",
  MATCH_LIVE: "match-start", MATCH_RESULT: "victory", MISSION_ALERT: "mission-alert", ACCESS_GRANTED: "access-granted",
  TREASURE_UNLOCKED: "treasure-unlocked", CHAMPION_REVEAL: "champion", BIRTHDAY_CAKE: "birthday-celebration",
  CUSTOM_ANNOUNCEMENT: "notification",
};
const aliases: Record<string,string> = { welcome:"intro", versus:"versus-impact", announcement:"notification" };

const pathFor = (asset: AudioAsset) => `/assets/audio/${asset.type === "voice" ? "voice" : "sfx"}/${asset.name}.mp3`;

export function useAudioEngine() {
  const speech = useRef<SpeechEnvelopeReader | null>(null);
  const speechEnabled = useRef(false);
  const manifest = useRef(new Map<string, AudioAsset>());
  const sounds = useRef(new Map<string, HTMLAudioElement>());
  const current = useRef<HTMLAudioElement | null>(null);
  const cueTimer = useRef<number | undefined>(undefined);
  const playbackGeneration = useRef(0);
  const sequencePaused = useRef(false);
  const releaseCurrentSegment = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(.75);

  useEffect(() => {
    speech.current = new SpeechEnvelopeReader();
    let cancelled = false;
    void fetch("/assets/audio/manifest.json", { cache: "force-cache" }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo cargar el manifiesto de audio");
      const data = await response.json() as Manifest;
      if (cancelled) return;
      for (const asset of data.assets) {
        manifest.current.set(asset.name, asset);
        const audio = new Audio(pathFor(asset));
        audio.preload = "none"; audio.loop = asset.loop; audio.volume = asset.volume * .75;
        sounds.current.set(asset.name, audio);
      }
      setReady(true);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Audio no disponible"));
    const soundMap = sounds.current;
    return () => { speech.current?.dispose(); speech.current = null; cancelled = true; for (const audio of soundMap.values()) { audio.pause(); audio.src = ""; } };
  }, []); // load once; volume changes are applied by the setter

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    for (const audio of sounds.current.values()) audio.muted = value;
    if (current.current) current.current.muted = value;
  }, []);

  const setVolume = useCallback((value: number) => {
    const safe = Math.min(1, Math.max(0, value)); setVolumeState(safe);
    // HTMLAudioElement is an external mutable browser resource, not React state.
    // eslint-disable-next-line react-hooks/immutability
    for (const [name, audio] of sounds.current) audio.volume = (manifest.current.get(name)?.volume ?? 1) * safe;
    if (current.current && ![...sounds.current.values()].includes(current.current)) current.current.volume = safe;
  }, []);

  const play = useCallback(async (name: string, options?: { volume?: number; loop?: boolean }) => {
    name = aliases[name] ?? name;
    const audio = sounds.current.get(name); const asset = manifest.current.get(name);
    if (!audio || !asset) throw new Error(`Sonido no incluido en el manifiesto: ${name}`);
    if (current.current && current.current !== audio) { current.current.pause(); current.current.currentTime = 0; }
    audio.pause(); audio.currentTime = 0; audio.loop = options?.loop ?? asset.loop;
    audio.volume = (options?.volume ?? asset.volume) * volume; audio.muted = muted;
    current.current = audio; await audio.play();
  }, [muted, volume]);

  const unlock = useCallback(async () => { await play("intro", { volume: .35 }); }, [play]);
  const prepareSpeech = useCallback((scene: DisplayScene) => {
    if (!sceneUsesNexusFace(scene) && !sceneIsBreachSequence(scene)) return;
    for (const segment of scene.sound.sequence ?? []) {
      if (segment.kind === "audio" && segment.url) speech.current?.prepare(segment.url);
    }
    if (scene.sound.url) speech.current?.prepare(scene.sound.url, scene.sound.analysisUrl);
    const name = scene.sound.name ?? defaults[scene.scene_type.toUpperCase()];
    const asset = manifest.current.get(aliases[name] ?? name);
    if (!scene.sound.url && !scene.sound.sequence?.length && asset) speech.current?.prepare(pathFor(asset));
  }, []);
  const getSpeechLevel = useCallback(() => speechEnabled.current && !sequencePaused.current ? speech.current?.level(current.current) ?? 0 : 0, []);
  const getVoicePosition = useCallback(() => ({time:current.current?.currentTime??0,duration:current.current?.duration??0}), []);
  const playScene = useCallback(async (scene: DisplayScene) => {
    speechEnabled.current = sceneUsesNexusFace(scene) || sceneIsBreachSequence(scene);
    prepareSpeech(scene);
    releaseCurrentSegment.current?.();
    releaseCurrentSegment.current = null;
    if (current.current) { current.current.pause(); current.current = null; }
    if (scene.sound.sequence?.length) {
      const generation=++playbackGeneration.current;
      if(cueTimer.current)window.clearTimeout(cueTimer.current);
      for(const segment of scene.sound.sequence){
        if(generation!==playbackGeneration.current)return;
        if(segment.kind==="silence"){
          let remaining=segment.durationMs;let previous=performance.now();
          while(remaining>0&&generation===playbackGeneration.current){await new Promise<void>(resolve=>window.setTimeout(resolve,Math.min(50,remaining)));const now=performance.now();if(!sequencePaused.current)remaining-=now-previous;previous=now}
          continue;
        }
        if(!segment.url)continue;
        const audio=new Audio(segment.url);audio.preload="auto";audio.volume=segment.volume*volume;audio.muted=muted;current.current=audio;audio.load();
        await new Promise<void>(resolve=>{const done=()=>{audio.removeEventListener("ended",done);audio.removeEventListener("error",done);if(releaseCurrentSegment.current===done)releaseCurrentSegment.current=null;resolve()};releaseCurrentSegment.current=done;audio.addEventListener("ended",done,{once:true});audio.addEventListener("error",done,{once:true});void audio.play().catch(done)});
      }
      return;
    }
    if (scene.sound.url) {
      playbackGeneration.current += 1;
      const generation = playbackGeneration.current;
      if (cueTimer.current) window.clearTimeout(cueTimer.current);
      const audio=new Audio(scene.sound.url);audio.preload="auto";audio.loop=scene.sound.loop??false;
      audio.volume=(scene.sound.volume??1)*volume;audio.muted=muted;current.current=audio;audio.load();
      const cue=scene.sound.cueMs??0;
      if(cue>0)await new Promise<void>(resolve=>{
        const release=()=>{releaseCurrentSegment.current=null;resolve()};
        releaseCurrentSegment.current=release;
        cueTimer.current=window.setTimeout(release,cue);
      });
      if(generation!==playbackGeneration.current)return;
      if(audio.loop){await audio.play();return}
      await new Promise<void>((resolve,reject)=>{
        const cleanup=()=>{audio.removeEventListener("ended",ended);audio.removeEventListener("error",failed);if(releaseCurrentSegment.current===ended)releaseCurrentSegment.current=null};
        const ended=()=>{cleanup();resolve()};
        const failed=()=>{cleanup();reject(new Error("No se pudo terminar el audio de la escena"))};
        releaseCurrentSegment.current=ended;
        audio.addEventListener("ended",ended,{once:true});
        audio.addEventListener("error",failed,{once:true});
        void audio.play().catch(failed);
      });
      return;
    }
    const name = scene.sound.name ?? defaults[scene.scene_type.toUpperCase()];
    if (name) {
      await play(name, { volume: scene.sound.volume, loop: scene.sound.loop });
      const audio=sounds.current.get(aliases[name]??name);
      if(!audio||audio.loop||audio.ended)return;
      await new Promise<void>(resolve=>{
        const done=()=>{audio.removeEventListener("ended",done);audio.removeEventListener("error",done);if(releaseCurrentSegment.current===done)releaseCurrentSegment.current=null;resolve()};
        releaseCurrentSegment.current=done;
        audio.addEventListener("ended",done,{once:true});
        audio.addEventListener("error",done,{once:true});
      });
    }
  }, [muted,play,prepareSpeech,volume]);
  const stop = useCallback(() => { speechEnabled.current=false;playbackGeneration.current+=1;sequencePaused.current=false;if(cueTimer.current)window.clearTimeout(cueTimer.current);releaseCurrentSegment.current?.();releaseCurrentSegment.current=null;if (current.current) { current.current.pause(); current.current.currentTime = 0; current.current = null; } }, []);
  const pause = useCallback(() => { sequencePaused.current=true;current.current?.pause(); }, []);
  const resume = useCallback(async () => { sequencePaused.current=false;if (current.current && !current.current.ended) await current.current.play(); }, []);

  return { ready, error, muted, volume, setMuted, setVolume, unlock, playScene, stop, pause, resume, prepareSpeech, getSpeechLevel, getVoicePosition };
}
