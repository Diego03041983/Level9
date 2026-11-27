"use client";
import {useEffect,useState} from "react";
import "./GlitchDefeated.css";
export function GlitchDefeated(){
  const [progress,setProgress]=useState(0);
  useEffect(()=>{const started=performance.now();let frame=0;const tick=()=>{setProgress(Math.min(1,(performance.now()-started)/6000));frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)},[]);
  return <div className="glitch-defeated" aria-label="Glitch derrotado">
    <div className="glitch-defeated-grid"/>
    <div className="glitch-defeated-symbol" style={{transform:`translate(-50%,-50%) scale(${1+progress*.55}) rotate(${progress*12}deg)`,opacity:1-progress*.9}}>G<span>✕</span></div>
    <div className="glitch-defeated-shards" style={{opacity:progress}}/>
    <h1 style={{opacity:Math.min(1,progress*3)}}>GLITCH DERROTADO</h1>
    <p>RESTAURANDO NEXUS</p>
  </div>;
}
