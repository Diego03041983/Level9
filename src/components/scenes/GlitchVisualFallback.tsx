"use client";

import Image from "next/image";
import "./GlitchVisualFallback.css";

export function GlitchVisualFallback(){
  return <div className="glitch-visual-fallback" aria-label="Transmisión de Glitch">
    <Image src="/assets/mission/glitch-fallback.jpg" alt="" fill sizes="100vw" priority className="glitch-visual-fallback-face"/>
    <div className="glitch-visual-fallback-lines" aria-hidden="true"/>
    <div className="glitch-visual-fallback-band" aria-hidden="true"/>
    <div className="glitch-visual-fallback-vignette" aria-hidden="true"/>
  </div>;
}
