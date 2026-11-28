"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Bot,Coins,Crown,Dices,FlaskConical,Gamepad2,Gem,Ghost,Headphones,Heart,Hexagon,Keyboard,KeyRound,LockKeyhole,Orbit,PackageOpen,Rocket,ScanFace,Shield,Skull,Star,Sword,Trophy,Zap} from "lucide-react";
import "./MissionChallenges.css";

type Mission={id:string;name:string;status:string;runId:string;remainingSeconds:number;syncedAt:number};
type Team={slot:number;name:string;assigned:boolean;complete:boolean};
type Card={index:number;symbol:number|null;matched:boolean};
type State={slot:number;complete:boolean;digit:string|null;correct:boolean;sequenceStep:number;sequence:{prompt:string;options:string[]}|null;cards:Card[]|null;memoryAttempts:number;memoryMatched:number;memoryLockedUntil:string|null};
const icons=[Gamepad2,Gem,KeyRound,Bot,Zap,Star,Crown,Trophy,Shield,Sword,Heart,Coins,PackageOpen,Ghost,Rocket,Orbit,Headphones,Keyboard,Dices,LockKeyhole,FlaskConical,Hexagon,Skull,ScanFace];
const colors=["fire","water","wind","earth"];
const introductions=["Ingresá el código encontrado en el desafío físico.","Sumá los números de las monedas y luego resolvé las secuencias.","Resolvé el acertijo de Lautaro y después recuperá las 24 parejas.","Ordená los cuatro números de las tarjetas físicas."];
const accessLabels=["Código alfanumérico","Resultado de las monedas","Resultado del acertijo","Código de cuatro posiciones"];
const tokenKey=(missionId:string,slot:number)=>`level9:mission:${missionId}:team:${slot}`;
function playEffect(name:"access-granted"|"access-denied"|"notification"|"treasure-unlocked",volume=.3){
  const sound=new Audio(`/assets/audio/sfx/${name}.mp3`);
  sound.volume=volume;
  void sound.play().catch(()=>undefined);
}

function Icon({symbol}:{symbol:number}){
  const Component=icons[symbol-1];
  return Component?<Component aria-hidden="true" strokeWidth={2.2}/>:null;
}

export function MissionChallenges(){
  const[mission,setMission]=useState<Mission|null>(null);
  const[teams,setTeams]=useState<Team[]>([]);
  const[selected,setSelected]=useState<number|null>(null);
  const[state,setState]=useState<State|null>(null);
  const[answer,setAnswer]=useState("");
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");
  const[loading,setLoading]=useState(true);
  const[clockNow,setClockNow]=useState(0);
  const requestId=useRef(0);
  const currentRun=useRef("");
  const currentTeam=teams.find(team=>team.slot===selected);
  const active=mission?.status==="live"||mission?.status==="paused";
  const seconds=mission?.status==="live"?Math.max(0,mission.remainingSeconds-Math.floor((clockNow-mission.syncedAt)/1000)):mission?.remainingSeconds??0;
  const clock=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  const recovered=teams.filter(team=>team.complete).length;

  const loadLobby=useCallback(async()=>{
    const response=await fetch("/api/mission/challenges",{cache:"no-store"});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error??"No se pudo cargar la misión");
    if(currentRun.current&&currentRun.current!==body.mission.runId){requestId.current++;setSelected(null);setState(null);setAnswer("");setMessage("")}
    currentRun.current=body.mission.runId;
    const now=Date.now();
    setMission({...body.mission,syncedAt:now});
    setClockNow(now);
    setTeams(body.teams);
    if(body.mission.status==="ready")setState(null);
  },[]);

  useEffect(()=>{
    const clockTimer=window.setInterval(()=>setClockNow(Date.now()),1000);
    const initial=window.setTimeout(()=>void loadLobby().catch(error=>setMessage(error instanceof Error?error.message:"Misión no disponible")).finally(()=>setLoading(false)),0);
    const interval=window.setInterval(()=>void loadLobby().catch(()=>undefined),5000);
    return()=>{window.clearTimeout(initial);window.clearInterval(interval);window.clearInterval(clockTimer)};
  },[loadLobby]);

  const loadState=useCallback(async(missionId:string,slot:number,token:string)=>{
    const response=await fetch(`/api/mission/challenges?missionId=${missionId}&slot=${slot}`,{headers:{"x-mission-team-token":token},cache:"no-store"});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error??"No se pudo recuperar el desafío");
    return body.state as State;
  },[]);

  const selectTeam=async(slot:number)=>{
    if(!mission)return;
    const id=++requestId.current;
    setSelected(slot);setState(null);setAnswer("");setMessage("");
    if(mission.status==="ready")return;
    const token=sessionStorage.getItem(tokenKey(mission.id,slot));
    if(!token)return;
    setBusy(true);
    try{const next=await loadState(mission.id,slot,token);if(requestId.current===id)setState(next)}
    catch{sessionStorage.removeItem(tokenKey(mission.id,slot))}
    finally{if(requestId.current===id)setBusy(false)}
  };

  const action=async(kind:"unlock"|"sequence"|"flip",value?:string,index?:number)=>{
    if(!mission||selected===null||busy)return;
    const id=requestId.current;
    const token=sessionStorage.getItem(tokenKey(mission.id,selected));
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/mission/challenges",{method:"POST",headers:{"content-type":"application/json",...(token?{"x-mission-team-token":token}:{})},body:JSON.stringify({missionId:mission.id,slot:selected,action:kind,answer:value,index})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error??"No se pudo validar");
      if(body.accepted===false){setMessage("ACCESO DENEGADO · Probá otra vez");playEffect("access-denied",.2);return}
      if(id!==requestId.current)return;
      if(body.token)sessionStorage.setItem(tokenKey(mission.id,selected),body.token);
      const next=body.state as State;
      if(kind==="sequence"){
        setMessage(next.correct?"SECUENCIA CORRECTA":"SECUENCIA INCORRECTA · Intentá de nuevo");
        playEffect(next.correct?"notification":"access-denied",.2);
      }
      if(kind==="flip"&&state&&next.memoryMatched>state.memoryMatched){setMessage("PAREJA RECUPERADA");playEffect("notification",.2)}
      if(next.complete){setMessage("SISTEMA DE SEGURIDAD VULNERADO");playEffect("treasure-unlocked",.35)}
      else if(kind==="unlock")playEffect("access-granted",.25);
      setState(next);setAnswer("");
      if(next.complete)void loadLobby().catch(()=>undefined);
    }catch(error){if(id===requestId.current)setMessage(error instanceof Error?error.message:"No se pudo guardar el progreso")}
    finally{if(id===requestId.current)setBusy(false)}
  };

  useEffect(()=>{
    if(!state?.memoryLockedUntil||!mission||selected===null)return;
    const remaining=Date.parse(state.memoryLockedUntil)-Date.now();
    const token=sessionStorage.getItem(tokenKey(mission.id,selected));
    if(!token)return;
    const id=requestId.current;
    const timeout=window.setTimeout(()=>void loadState(mission.id,selected,token).then(next=>{if(requestId.current===id)setState(next)}).catch(()=>undefined),Math.max(0,remaining)+90);
    return()=>window.clearTimeout(timeout);
  },[state?.memoryLockedUntil,mission,selected,loadState]);

  if(loading)return <section className="mission-challenges"><p>Cargando desafíos de la misión…</p></section>;
  if(!mission)return <section className="mission-challenges"><p>{message||"La misión todavía no está configurada."}</p></section>;

  return <section className="mission-challenges" aria-label="Desafíos de los equipos">
    <div className="mission-challenges-header"><div><p className="mission-challenges-kicker">GLITCH SECURITY SYSTEM · TERMINAL DE EQUIPOS</p><h2>RECUPERÁ TU FRAGMENTO</h2></div><span className="mission-challenges-status">{mission.status==="live"?"MISIÓN EN CURSO":mission.status==="paused"?"RELOJ EN PAUSA":mission.status==="unlocked"?"MISIÓN COMPLETADA":mission.status==="finished"?"MISIÓN FINALIZADA":"ESPERANDO INICIO"}</span></div>
    <p className="mission-challenges-intro">Elegí tu equipo y resolvé su desafío en esta computadora. La TV mostrará cada fragmento recuperado.</p>
    <div className="mission-real-status"><div><small>{mission.status==="ready"?"RELOJ AÚN NO INICIADO":mission.status==="paused"?"TIEMPO CONGELADO":mission.status==="unlocked"||mission.status==="finished"?"TIEMPO AL COMPLETAR":"TIEMPO RESTANTE"}</small><strong>{clock}</strong></div><div><small>FRAGMENTOS RECUPERADOS</small><strong>{recovered} / 4</strong></div></div>
    <div className="mission-real-progress" role="progressbar" aria-label="Fragmentos recuperados" aria-valuemin={0} aria-valuemax={4} aria-valuenow={recovered}><i style={{width:`${recovered*25}%`}}/></div>
    {mission.status==="ready"&&<p className="mission-waiting">Los sectores se habilitan cuando termina el mensaje de inicio de Glitch en la TV. Podés elegir un equipo para ver su desafío.</p>}
    <div className="mission-team-picker">{teams.map(team=><button key={team.slot} type="button" disabled={!team.assigned} onClick={()=>void selectTeam(team.slot)} className={`mission-team-choice ${colors[team.slot-1]} ${selected===team.slot?"selected":""}`} aria-pressed={selected===team.slot}><span>EQUIPO {team.name.toUpperCase()}</span><small>{!team.assigned?"SIN JUGADORES":team.complete?"FRAGMENTO RECUPERADO":"DESAFÍO PENDIENTE"}</small></button>)}</div>
    {selected!==null&&currentTeam&&<div className={`mission-team-work ${colors[selected-1]}`}>
      <div className="mission-team-work-head"><div><p>TERMINAL {String(selected).padStart(2,"0")}</p><h3>EQUIPO {currentTeam.name.toUpperCase()}</h3></div><button type="button" className="mission-back" onClick={()=>{requestId.current++;setSelected(null);setState(null);setMessage("")}}>CAMBIAR EQUIPO</button></div>
      {mission.status==="ready"?<div className="mission-sector-preview"><p>{introductions[selected-1]}</p><strong>SECTOR EN ESPERA · Glitch todavía no inició el juego</strong></div>:!state&&(mission.status==="unlocked"||mission.status==="finished")?<div className="mission-sector-preview"><p>La misión ya terminó. El tablero de la TV muestra el resultado final.</p></div>:!state?<form className="mission-access" onSubmit={event=>{event.preventDefault();void action("unlock",answer)}}><p>{introductions[selected-1]}</p><label htmlFor="mission-answer">{accessLabels[selected-1]}</label><input id="mission-answer" autoComplete="off" autoCapitalize="characters" inputMode={selected===1?"text":"numeric"} maxLength={selected===1?16:selected===4?4:3} value={answer} onChange={event=>setAnswer(event.target.value)} disabled={busy||!active} placeholder={selected===4?"· · · ·":"Ingresá tu respuesta"}/><button type="submit" disabled={busy||!active||!answer.trim()}>{busy?"VALIDANDO…":"VALIDAR ACCESO"}</button></form>:state.complete?<div className="mission-fragment" role="status"><div className="mission-fragment-orbit"><span>{state.digit}</span></div><h4>SISTEMA DE SEGURIDAD VULNERADO</h4><p>Fragmento secreto recuperado · posición {selected} del código final</p></div>:selected===2?<div className="mission-sequence"><div className="mission-progress-row"><b>SEQUENCE HACKER</b><span>{state.sequenceStep} / 4</span></div><div className="mission-progress-track"><i style={{width:`${state.sequenceStep*25}%`}}/></div><p className="mission-sequence-prompt">{state.sequence?.prompt}</p><div className="mission-sequence-options">{state.sequence?.options.map(option=><button type="button" key={option} disabled={busy||!active} onClick={()=>void action("sequence",option)}>{option}</button>)}</div><p className="mission-game-hint">Seleccioná la respuesta correcta para avanzar.</p></div>:selected===3?<div className="mission-memory"><div className="mission-progress-row"><b>MEMORY HACK</b><span>{state.memoryMatched} / 24 PAREJAS</span></div><div className="mission-progress-track"><i style={{width:`${state.memoryMatched/24*100}%`}}/></div><div className="mission-memory-stats"><span>INTENTOS <b>{state.memoryAttempts}</b></span><span>TARJETAS PENDIENTES <b>{48-state.memoryMatched*2}</b></span><span>FRAGMENTO <b>BLOQUEADO</b></span></div><div className="mission-memory-grid">{state.cards?.map(card=>{const exposed=card.symbol!==null;const locked=Boolean(state.memoryLockedUntil);return <button key={card.index} type="button" className={`mission-memory-card ${exposed?"exposed":""} ${card.matched?"matched":""}`} disabled={busy||!active||locked||exposed} onClick={()=>void action("flip",undefined,card.index)} aria-label={exposed?`Tarjeta ${card.index+1} descubierta`:`Revelar tarjeta ${card.index+1}`}><span className="mission-memory-card-face">{exposed?<Icon symbol={card.symbol!}/>:<LockKeyhole aria-hidden="true"/>}</span></button>})}</div><p className="mission-game-hint">Las parejas encontradas conservan su posición. No hay límite de intentos.</p></div>:null}
      {message&&<p className={`mission-challenge-feedback ${message.includes("DENEGADO")||message.includes("INCORRECTA")?"error":""}`} role="status" aria-live="polite">{message}</p>}
    </div>}
  </section>;
}
