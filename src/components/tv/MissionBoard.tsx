"use client";
import {useEffect,useState} from "react";
import type {DisplayMission} from "@/lib/tv/useDisplayConnection";
import "./MissionBoard.css";

const names=["FUEGO","AGUA","VIENTO","TIERRA"];
export function MissionBoard({mission}:{mission:DisplayMission}){
  const [now,setNow]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer)},[]);
  const endpoint=mission.status==="paused"?mission.paused_at:mission.unlocked_at??mission.completed_at;
  const elapsed=mission.started_at?Math.max(0,Math.floor(((endpoint?Date.parse(endpoint):now)-Date.parse(mission.started_at))/1000)-(mission.paused_seconds??0)):0;
  const remaining=Math.max(0,(mission.duration_seconds??1800)+(mission.extension_seconds??0)-elapsed);
  const mm=String(Math.floor(remaining/60)).padStart(2,"0"),ss=String(remaining%60).padStart(2,"0");
  const complete=mission.digits.filter(item=>item.digit!==null).length;
  return <div className="mission-board">
    <div className="mission-board-inner">
      <p className="mission-board-system">GLITCH SECURITY SYSTEM</p>
      <h1>{mission.name||"MISIÓN ROBUX SECRETA"}</h1>
      <div className="mission-board-clock">{mm}:{ss}</div>
      <p className="mission-board-caption">{mission.status==="paused"?"RELOJ EN PAUSA":mission.status==="unlocked"||mission.status==="finished"?"SISTEMA DESBLOQUEADO":"TIEMPO RESTANTE"}</p>
      <div className="mission-board-slots">{names.map((name,index)=>{
        const digit=mission.digits.find(item=>item.slot===index+1)?.digit;
        return <div className={`mission-board-slot slot-${index+1} ${digit!==null&&digit!==undefined?"revealed":""}`} key={name}>
          <b>EQUIPO {name}</b><strong>{digit??"🔒"}</strong><small>{digit==null?"PENDIENTE":"DÍGITO DESCUBIERTO"}</small>
        </div>;
      })}</div>
      <div className="mission-board-progress"><i style={{width:`${complete*25}%`}}/></div>
      <p className="mission-board-status">{complete===4?"CÓDIGO COMPLETO":`${complete} DE 4 DÍGITOS DESBLOQUEADOS`}</p>
    </div>
  </div>;
}
