"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayScene } from "@/lib/tv/protocol";

interface AudioAsset { name: string; type: "sfx" | "music" | "voice"; volume: number; loop: boolean }
interface Manifest { assets: AudioAsset[] }
type PreparedAudio = { sceneId: string; audio: HTMLAudioElement; ready: Promise<void> };

const defaults: Record<string, string> = {
  EVENT_INTRO: "intro", WELCOME_SCREEN: "intro", PLAYER_UNLOCKED: "player-unlocked", PLAYER_WELCOME: "player-unlocked", PLAYER_DRAW: "roulette-loop", TEAM_DRAW: "team-selected",
  VERSUS: "versus-impact", VERSUS_SCREEN: "versus-impact", DUO_VERSUS_SCREEN: "versus-impact", ANNOUNCEMENT: "notification", MATCH_COUNTDOWN: "countdown-tick",
  MATCH_LIVE: "match-start", MATCH_RESULT: "victory", MISSION_ALERT: "mission-alert", ACCESS_GRANTED: "access-granted",
  TREASURE_UNLOCKED: "treasure-unlocked", CHAMPION_REVEAL: "champion", BIRTHDAY_CAKE: "birthday-celebration",
  CUSTOM_ANNOUNCEMENT: "notification",
};
const aliases: Record<string,string> = { welcome:"intro", versus:"versus-impact", announcement:"notification" };

const pathFor = (asset: AudioAsset) => `/assets/audio/${asset.type === "voice" ? "voice" : "sfx"}/${asset.name}.mp3`;
const waitUntilPlayable = (audio: HTMLAudioElement) => {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; window.clearTimeout(timer); audio.removeEventListener("canplay", done); audio.removeEventListener("error", done); resolve(); };
    const timer = window.setTimeout(done, 5000);
    audio.addEventListener("canplay", done, { once: true });
    audio.addEventListener("error", done, { once: true });
  });
};

export function useAudioEngine() {
  const manifest = useRef(new Map<string, AudioAsset>());
  const sounds = useRef(new Map<string, HTMLAudioElement>());
  const current = useRef<HTMLAudioElement | null>(null);
  const cueTimer = useRef<number | undefined>(undefined);
  const playbackGeneration = useRef(0);
  const prepared = useRef<PreparedAudio | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(.75);

  useEffect(() => {
    let cancelled = false;
    void fetch("/assets/audio/manifest.json", { cache: "force-cache" }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo cargar el manifiesto de audio");
      const data = await response.json() as Manifest;
      if (cancelled) return;
      for (const asset of data.assets) {
        manifest.current.set(asset.name, asset);
        const audio = new Audio(pathFor(asset));
        audio.preload = "auto"; audio.loop = asset.loop; audio.volume = asset.volume * .75;
        sounds.current.set(asset.name, audio); audio.load();
      }
      setReady(true);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Audio no disponible"));
    const soundMap = sounds.current;
    return () => { cancelled = true; for (const audio of soundMap.values()) { audio.pause(); audio.src = ""; } };
  }, []); // load once; volume changes are applied by the setter

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    for (const audio of sounds.current.values()) audio.muted = value;
    if (current.current) current.current.muted = value;
    if (prepared.current) prepared.current.audio.muted = value;
  }, []);

  const setVolume = useCallback((value: number) => {
    const safe = Math.min(1, Math.max(0, value)); setVolumeState(safe);
    // HTMLAudioElement is an external mutable browser resource, not React state.
    // eslint-disable-next-line react-hooks/immutability
    for (const [name, audio] of sounds.current) audio.volume = (manifest.current.get(name)?.volume ?? 1) * safe;
    if (current.current && ![...sounds.current.values()].includes(current.current)) current.current.volume = safe;
    if (prepared.current) prepared.current.audio.volume = safe;
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
  const prepareScene = useCallback(async (scene: DisplayScene) => {
    if (!scene.sound.url) return;
    if (prepared.current?.sceneId === scene.id) return prepared.current.ready;
    if (prepared.current && prepared.current.audio !== current.current) {
      prepared.current.audio.pause();
      prepared.current.audio.removeAttribute("src");
      prepared.current.audio.load();
    }
    const audio = new Audio(scene.sound.url);
    audio.preload = "auto"; audio.loop = scene.sound.loop ?? false;
    audio.volume = (scene.sound.volume ?? 1) * volume; audio.muted = muted;
    const ready = waitUntilPlayable(audio);
    prepared.current = { sceneId: scene.id, audio, ready };
    audio.load();
    await ready;
  }, [muted, volume]);
  const playScene = useCallback(async (scene: DisplayScene) => {
    if (scene.sound.url) {
      playbackGeneration.current += 1;
      const generation = playbackGeneration.current;
      if (cueTimer.current) window.clearTimeout(cueTimer.current);
      if (current.current) { current.current.pause(); current.current.currentTime = 0; }
      await prepareScene(scene);
      if(generation!==playbackGeneration.current)return;
      let audio:HTMLAudioElement;
      if(prepared.current?.sceneId===scene.id)audio=prepared.current.audio;
      else{audio=new Audio(scene.sound.url);audio.loop=scene.sound.loop??false;audio.volume=(scene.sound.volume??1)*volume;audio.muted=muted}
      current.current=audio;
      const cue=scene.sound.cueMs??0;
      if(cue>0)await new Promise<void>(resolve=>{cueTimer.current=window.setTimeout(resolve,cue)});
      if(generation!==playbackGeneration.current)return;
      await audio.play();return;
    }
    const name = scene.sound.name ?? defaults[scene.scene_type.toUpperCase()];
    if (name) await play(name, { volume: scene.sound.volume, loop: scene.sound.loop });
  }, [muted,play,prepareScene,volume]);
  const stop = useCallback(() => { playbackGeneration.current+=1;if(cueTimer.current)window.clearTimeout(cueTimer.current);if (current.current) { current.current.pause(); current.current.currentTime = 0; current.current = null; }if(prepared.current){prepared.current.audio.pause();prepared.current=null} }, []);
  const pause = useCallback(() => { current.current?.pause(); }, []);
  const resume = useCallback(async () => { if (current.current) await current.current.play(); }, []);

  return { ready, error, muted, volume, setMuted, setVolume, unlock, prepareScene, playScene, stop, pause, resume };
}
