"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { robloxStandings } from "@/lib/domain/roblox-standings";
import { suggestRobloxGroup } from "@/lib/competition/roblox-group";

type Player={id:string;first_name:string;gamer_tag:string|null;player_number:number;administrative_status:string;operational_status:string;registration_status:string};
type Activity={id:string;name:string;activity_type:"fifa"|"foosball"|"roblox";rules:Record<string,unknown>};
type Data={
  event:{id:string;name:string};activities:Activity[];players:Player[];
  rosters:{activity_id:string;discipline:string;participant_id:string}[];
  stations:{id:string;name:string;station_type:string;status:string;capacity:number}[];
  assignments:{station_id:string;participant_id:string;context_id:string;status:string}[];
  tournaments:{id:string;activity_id:string;name:string;status:string;entry_kind:string;champion_entry_id:string|null}[];
  entries:{id:string;tournament_id:string;participant_id:string|null;team_id:string|null;seed:number}[];
  rounds:{id:string;tournament_id:string;name:string;round_number:number}[];
  matches:{id:string;tournament_id:string;round_id:string;match_number:number;status:string;version:number;station_id:string|null}[];
  slots:{match_id:string;slot:number;entry_id:string|null}[];
  members:{team_id:string;participant_id:string;position:number}[];
  groups:{id:string;activity_id:string;status:string;starts_at:string;rules:{discipline?:string;comparison_key?:string}}[];
  groupPlayers:{challenge_id:string;participant_id:string;station_id:string}[];
  groupResults:{challenge_id:string;participant_id:string;score:number;position:number}[];
};
const games=[
  ["epic-minigames","Epic Minigames","minijuegos ganados"],
  ["natural-disaster-survival","Natural Disaster Survival","rondas sobrevividas"],
  ["speed-run-4","Speed Run 4","niveles superados"],
  ["super-golf","Super Golf!","golpes; menos es mejor"],
] as const;
const stateName:Record<string,string>={available:"Disponible",called:"Convocado",competing:"Jugando",resting:"Descanso",unavailable:"No disponible",pending:"Pendiente",live:"En juego",complete:"Terminado"};
function shuffle<T>(ids:T[]){const result=[...ids];for(let index=result.length-1;index>0;index--){const target=Math.floor(Math.random()*(index+1));[result[index],result[target]]=[result[target],result[index]]}return result}
function drawOrder(ids:string[],teamGame:boolean){
  const players=shuffle(ids);
  if(!teamGame)return players;
  const pairs=Array.from({length:players.length/2},(_,index)=>players.slice(index*2,index*2+2));
  return shuffle(pairs).flat();
}

export function CompetitionCenter(){
  const [data,setData]=useState<Data|null>(null);
  const [activityId,setActivityId]=useState("");
  const [discipline,setDiscipline]=useState<string>(games[0][0]);
  const [selected,setSelected]=useState<string[]>([]);
  const [preview,setPreview]=useState<string[]|null>(null);
  const [scores,setScores]=useState<Record<string,string>>({});
  const [comparison,setComparison]=useState("standard");
  const [scaleText,setScaleText]=useState("10,7,5,3,1");
  const [groupChoice,setGroupChoice]=useState<string[]>([]);
  const [allowRepeat,setAllowRepeat]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("Cargando competencias…");
  const load=useCallback(async()=>{
    const response=await fetch("/api/admin/competition-center",{cache:"no-store"});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error??"No se pudieron cargar las competencias");
    setData(body);setActivityId(value=>value||body.activities?.[0]?.id||"");
    const roblox=body.activities?.find((item:Activity)=>item.activity_type==="roblox");
    if(Array.isArray(roblox?.rules?.robloxPoints))setScaleText(roblox.rules.robloxPoints.join(","));
  },[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load().catch(error=>setMessage(error.message)),0);return()=>clearTimeout(timer)},[load]);
  const activity=data?.activities.find(item=>item.id===activityId);
  const rosterDiscipline=activity?.activity_type==="roblox"?discipline:"main";
  useEffect(()=>{
    if(!data)return;
    const timer=window.setTimeout(()=>{
      setSelected(data.rosters.filter(item=>item.activity_id===activityId&&item.discipline===rosterDiscipline).map(item=>item.participant_id));
      setPreview(null);
    },0);
    return()=>clearTimeout(timer);
  },[data,activityId,rosterDiscipline]);
  const post=async(body:Record<string,unknown>)=>{
    if(!data)return null;
    setBusy(true);
    try{
      const response=await fetch("/api/admin/competition-center",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventId:data.event.id,...body})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"No se pudo guardar");
      await load();setMessage(result.announcementFailed?"Cambios guardados. El anuncio no llegó a la TV; usá Repetir anuncio.":(["callMatch","announceMatch","startRoblox"].includes(String(body.action))?"Convocatoria enviada a la TV con fotos y locución.":body.action==="announceDraw"?"Cuadro del sorteo enviado a la TV.":"Cambios guardados"));return result;
    }catch(error){setMessage(error instanceof Error?error.message:"Error inesperado");return null}
    finally{setBusy(false)}
  };
  const reset=async()=>{
    if(!data||!window.confirm("¿Reiniciar todas las competencias de este evento? Se borrarán selecciones, sorteos, torneos, grupos y resultados de FIFA, Metegol y Roblox. Se conservarán jugadores, misión y archivos."))return;
    const result=await post({action:"reset"});
    if(!result)return;
    setSelected([]);setPreview(null);setScores({});setGroupChoice([]);setAllowRepeat(false);setComparison("standard");
    setMessage("Competencias reiniciadas. Ya podés elegir jugadores y hacer nuevos sorteos.");
  };
  const playerName=(id:string)=>{const player=data?.players.find(item=>item.id===id);return player?.gamer_tag||player?.first_name||"Jugador"};
  const active=data?.players.filter(item=>item.administrative_status==="active"&&item.registration_status==="ACTIVATED")??[];
  const roster=data?.rosters.filter(item=>item.activity_id===activityId&&item.discipline===rosterDiscipline).map(item=>item.participant_id)??[];
  const tournament=data?.tournaments.find(item=>item.activity_id===activityId&&item.status!=="cancelled");
  const activeTournament=tournament&&tournament.status!=="finished";
  const entryPlayers=(entryId:string|null)=>{
    const entry=data?.entries.find(item=>item.id===entryId);
    if(!entry)return[];
    return entry.participant_id?[entry.participant_id]:(data?.members.filter(item=>item.team_id===entry.team_id).sort((a,b)=>a.position-b.position).map(item=>item.participant_id)??[]);
  };
  const matchEntry=(matchId:string,slot:number)=>data?.slots.find(item=>item.match_id===matchId&&item.slot===slot)?.entry_id??null;
  const sides=(matchId:string)=>[1,2].map(slot=>entryPlayers(matchEntry(matchId,slot)));
  const available=(ids:string[])=>ids.every(id=>data?.players.find(item=>item.id===id)?.operational_status==="available"&&!data?.assignments.some(item=>item.participant_id===id));
  const freeStations=(type:string)=>data?.stations.filter(item=>item.station_type===type&&item.status==="available"&&!data.assignments.some(assignment=>assignment.station_id===item.id))??[];
  const matches=data?.matches.filter(item=>item.tournament_id===tournament?.id).sort((a,b)=>{
    const one=data.rounds.find(round=>round.id===a.round_id)?.round_number??0;
    const two=data.rounds.find(round=>round.id===b.round_id)?.round_number??0;
    return one-two||a.match_number-b.match_number;
  })??[];
  const stationType=activity?.activity_type==="foosball"?"foosball":"playstation";
  const canCall=(match:Data["matches"][number])=>sides(match.id).every(side=>side.length>0)&&available(sides(match.id).flat())&&freeStations(stationType).length>0;
  const next=matches.find(match=>(match.status==="pending"||match.status==="called"&&!match.station_id)&&canCall(match));
  const groups=data?.groups.filter(item=>item.activity_id===activityId&&item.rules.discipline===discipline)??[];
  const results=data?.groupResults.filter(item=>groups.some(group=>group.id===item.challenge_id))??[];
  const played=new Set(results.map(item=>item.participant_id));
  const waiting=roster.filter(id=>!played.has(id));
  const freePcs=freeStations("pc");
  const recommended=suggestRobloxGroup(waiting.filter(id=>available([id])),waiting.length,freePcs.length);
  const groupCandidates=groupChoice.length?groupChoice:recommended;
  const canStartGroup=groupCandidates.length>=2&&groupCandidates.length<=Math.min(3,freePcs.length)&&available(groupCandidates)&&(allowRepeat||groupCandidates.every(id=>!played.has(id)));
  const comparableIds=new Set(groups.filter(group=>group.rules.comparison_key===comparison).map(group=>group.id));
  const standings=results.filter(item=>comparableIds.has(item.challenge_id)).sort((a,b)=>discipline==="super-golf"?a.score-b.score:b.score-a.score);
  const points=Array.isArray(activity?.rules?.robloxPoints)?activity.rules.robloxPoints.map(Number):[10,7,5,3,1];
  const allScores=data?.groupResults.map(result=>{
    const group=data.groups.find(item=>item.id===result.challenge_id);
    return {participantId:result.participant_id,discipline:group?.rules.discipline??"",score:Number(result.score),comparisonKey:group?.rules.comparison_key??"standard",playedAt:group?.starts_at??""};
  })??[];
  const overall=robloxStandings(allScores,points);
  const saveScale=async()=>{
    const parsed=scaleText.split(",").map(value=>Number(value.trim()));
    if(!parsed.length||parsed.length>64||parsed.some(value=>!Number.isInteger(value)||value<0||value>1000)){setMessage("Ingresá puntos enteros separados por coma, por ejemplo 10,7,5,3,1");return}
    await post({action:"scoreScale",activityId,points:parsed});
  };
  const saveRoster=async()=>{if(activity)await post({action:"roster",activityId,discipline:rosterDiscipline,participantIds:selected})};
  const confirm=async()=>{if(preview&&activity){const result=await post({action:"tournament",activityId,name:activity.name,orderedIds:preview});if(result)setPreview(null)}};
  const move=(index:number,delta:number)=>setPreview(current=>{if(!current)return current;const next=[...current],target=index+delta;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return next});
  const finishMatch=async(match:Data["matches"][number])=>{
    const rawHome=scores[`${match.id}:home`],rawAway=scores[`${match.id}:away`];
    const home=Number(rawHome),away=Number(rawAway);
    if(rawHome==null||rawAway==null||!Number.isInteger(home)||!Number.isInteger(away)||home===away||home<0||away<0){setMessage("Ingresá dos resultados enteros y distintos");return}
    const winnerEntryId=matchEntry(match.id,home>away?1:2);
    if(winnerEntryId)await post({action:"finishMatch",matchId:match.id,winnerEntryId,homeScore:home,awayScore:away,expectedVersion:match.version});
  };
  const finishGroup=async(group:Data["groups"][number])=>{
    const players=data?.groupPlayers.filter(item=>item.challenge_id===group.id)??[];
    const values=players.map(item=>({participantId:item.participant_id,score:Number(scores[`${group.id}:${item.participant_id}`])}));
    if(values.some(item=>scores[`${group.id}:${item.participantId}`]==null||!Number.isFinite(item.score)||item.score<0)){setMessage("Ingresá el resultado de cada jugador");return}
    await post({action:"finishRoblox",groupId:group.id,scores:values});
  };
  const matchCard=(match:Data["matches"][number])=>{
    const pair=sides(match.id),round=data?.rounds.find(item=>item.id===match.round_id);
    return <article key={match.id} className={`panel cut p-4 ${next?.id===match.id?"!border-lime-300/50":""}`}>
      <small className="text-cyan-300">{round?.name} · Partido {match.match_number} · {stateName[match.status]??match.status}</small>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 font-black"><span className="break-words">{pair[0].length?pair[0].map(playerName).join(" + "):"Por definir"}</span><span className="text-cyan-300">VS</span><span className="break-words text-right">{pair[1].length?pair[1].map(playerName).join(" + "):"Por definir"}</span></div>
      {match.station_id&&<p className="mt-2 text-xs text-slate-400">{data?.stations.find(item=>item.id===match.station_id)?.name}</p>}
      {(match.status==="pending"||match.status==="called"&&!match.station_id)&&<button disabled={busy||!canCall(match)} onClick={()=>void post({action:"callMatch",matchId:match.id})} className="primary-action mt-4 w-full py-3 text-xs disabled:opacity-40">{canCall(match)?"▶ TV + voz · Convocar enfrentamiento":"Esperando jugadores o recurso"}</button>}
      {match.status==="called"&&match.station_id&&<div className="mt-4 grid grid-cols-2 gap-2"><button disabled={busy} onClick={()=>void post({action:"startMatch",matchId:match.id})} className="primary-action py-3 text-xs">Iniciar partida</button><button disabled={busy} onClick={()=>void post({action:"announceMatch",matchId:match.id})} className="ghost-action py-3 text-xs">▶ Repetir en TV con voz</button></div>}
      {match.status==="live"&&<button disabled={busy} onClick={()=>void post({action:"announceMatch",matchId:match.id})} className="ghost-action mt-3 w-full py-3 text-xs">▶ Repetir en TV con voz</button>}{match.status==="live"&&<div className="mt-4"><div className="grid grid-cols-2 gap-2">{["home","away"].map(side=><input key={side} aria-label={side==="home"?"Puntos del primer lado":"Puntos del segundo lado"} type="number" min="0" placeholder={side==="home"?"Puntos 1":"Puntos 2"} value={scores[`${match.id}:${side}`]??""} onChange={event=>setScores(value=>({...value,[`${match.id}:${side}`]:event.target.value}))} className="rounded bg-black/25 p-3"/>)}</div><button disabled={busy} onClick={()=>void finishMatch(match)} className="primary-action mt-2 w-full py-3 text-xs">Guardar resultado y liberar jugadores</button></div>}
    </article>;
  };
  const pendingMatches=data?.matches.filter(item=>!["complete","walkover","cancelled"].includes(item.status))??[];
  const pendingGroups=games.reduce((count,game)=>{const gameRoster=data?.rosters.filter(item=>item.discipline===game[0]).length??0;const done=data?.groupResults.filter(item=>data.groups.some(group=>group.id===item.challenge_id&&group.rules.discipline===game[0])).length??0;const remaining=Math.max(0,gameRoster-done);return count+(remaining<2?0:Math.ceil(remaining/3))},0);
  const estimate=Math.max(pendingMatches.filter(item=>data?.tournaments.find(t=>t.id===item.tournament_id&&data.activities.find(a=>a.id===t.activity_id)?.activity_type==="fifa")).length*6,pendingMatches.filter(item=>data?.tournaments.find(t=>t.id===item.tournament_id&&data.activities.find(a=>a.id===t.activity_id)?.activity_type==="foosball")).length*8,pendingGroups*10);
  const allRecommendations=data?.activities.map(game=>{
    if(game.activity_type==="roblox"){
      const pcCount=freeStations("pc").length;
      const nextDiscipline=games.find(item=>data.rosters.some(roster=>roster.activity_id===game.id&&roster.discipline===item[0]&&available([roster.participant_id])&&!data.groupResults.some(result=>result.participant_id===roster.participant_id&&data.groups.some(group=>group.id===result.challenge_id&&group.rules.discipline===item[0]))));
      return {title:"Roblox",resource:`${pcCount} PC libres`,next:pcCount&&nextDiscipline?nextDiscipline[1]:"Esperando jugadores o PCs"};
    }
    const resource=game.activity_type==="fifa"?"playstation":"foosball";
    const candidate=data.matches.find(match=>{
      const matchTournament=data.tournaments.find(item=>item.id===match.tournament_id);
      return matchTournament?.activity_id===game.id&&(match.status==="pending"||match.status==="called"&&!match.station_id)
        &&sides(match.id).every(side=>side.length>0)&&available(sides(match.id).flat());
    });
    return {title:game.activity_type==="fifa"?"FIFA":"Metegol",resource:`${freeStations(resource).length} recursos libres`,next:candidate&&freeStations(resource).length?sides(candidate.id).map(side=>side.map(playerName).join(" + ")).join(" VS "):"Esperando cruce posible"};
  })??[];
  return <AppShell active="admin"><main className="mx-auto max-w-7xl px-5 pb-20">
    <Link href="/admin" className="text-xs font-bold text-cyan-300">← Control</Link>
    <p className="eyebrow mt-4">Organización simultánea · {data?.event.name}</p><h1 className="display-title mt-2 text-5xl">COMPETENCIAS</h1>
    <p role="status" className="mt-3 text-sm text-slate-300">{message}</p>
    <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300/25 bg-orange-300/5 p-4"><div><b className="text-sm text-orange-100">Reiniciar competencias</b><p className="mt-1 text-xs text-slate-400">Borra selecciones, sorteos, partidos y resultados de FIFA, Metegol y Roblox. Conserva jugadores, misión y archivos.</p></div><button type="button" disabled={busy||!data} onClick={()=>void reset()} className="rounded-lg border border-orange-300/50 px-4 py-3 text-xs font-black text-orange-100 hover:bg-orange-300/10 disabled:opacity-50">↺ VOLVER TODO A CERO</button></section>
    <div className="mt-6 grid gap-3 md:grid-cols-3">{data?.activities.map(item=><button key={item.id} onClick={()=>{setActivityId(item.id);if(item.activity_type==="roblox"&&Array.isArray(item.rules.robloxPoints))setScaleText(item.rules.robloxPoints.join(","))}} className={`panel cut p-4 text-left font-black ${activityId===item.id?"!border-cyan-300 text-cyan-200":""}`}>{item.name}<small className="mt-1 block font-normal text-slate-400">{item.activity_type==="fifa"?"1 contra 1 · PlayStation":item.activity_type==="foosball"?"2 contra 2 · Metegol":"2 o 3 jugadores · computadoras"}</small></button>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="panel cut p-5"><h2 className="text-xl font-black">1. Elegir participantes</h2>
        {activity?.activity_type==="roblox"&&<div className="mt-4 flex flex-wrap gap-2">{games.map(item=><button key={item[0]} onClick={()=>{setDiscipline(item[0]);setComparison("standard")}} className={`rounded border px-3 py-2 text-xs font-bold ${discipline===item[0]?"border-cyan-300 bg-cyan-300/10":"border-white/15"}`}>{item[1]}</button>)}</div>}
        <p className="mt-3 text-xs text-slate-400">Marcá solo a quienes participarán en este juego. Pueden jugar en otros cuando estén libres.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{active.map(player=><label key={player.id} className={`flex cursor-pointer items-center gap-2 rounded border p-3 text-sm ${selected.includes(player.id)?"border-cyan-300/60 bg-cyan-300/10":"border-white/10"}`}><input type="checkbox" checked={selected.includes(player.id)} onChange={()=>{setSelected(current=>current.includes(player.id)?current.filter(id=>id!==player.id):[...current,player.id]);setPreview(null)}} className="accent-cyan-300"/><span className="flex-1">#{player.player_number} {player.gamer_tag||player.first_name}</span><small className="text-slate-400">{stateName[player.operational_status]??player.operational_status}</small></label>)}</div>
        {!active.length&&<p className="mt-4 text-sm text-amber-200">Primero activá jugadores en Recepción.</p>}
        <button disabled={busy||!activity} onClick={()=>void saveRoster()} className="primary-action mt-4 w-full py-3 text-sm disabled:opacity-40">Guardar selección ({selected.length})</button>
      </section>
      <section className="panel cut p-5"><h2 className="text-xl font-black">2. {activity?.activity_type==="roblox"?"Próximo grupo":"Sortear y confirmar"}</h2>
        {activity?.activity_type==="roblox"?<div className="mt-4 space-y-4">
          <p className="text-sm text-slate-300">{waiting.length} sin jugar · {freePcs.length} computadoras libres</p>
          <p className="text-xs text-slate-400">Cada grupo compite con 3 jugadores, o con 2 cuando corresponde. Nunca con 1.</p>
          <p className="text-xs text-slate-400">Sugeridos: {recommended.length?recommended.map(playerName).join(", "):waiting.length===1?"Falta otro jugador para competir":freePcs.length<2?"Esperando dos computadoras libres":"Esperando dos jugadores disponibles"}</p>
          <label className="block text-xs">Condiciones comparables (misma ronda o recorrido)<input value={comparison} onChange={event=>setComparison(event.target.value)} className="mt-1 w-full rounded bg-black/25 p-3"/></label>
          <details className="rounded border border-white/10 p-3"><summary className="cursor-pointer text-xs font-bold">Elegir 2 o 3 jugadores manualmente</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{roster.map(id=><label key={id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={groupChoice.includes(id)} onChange={()=>setGroupChoice(current=>current.includes(id)?current.filter(item=>item!==id):current.length<3?[...current,id]:current)} className="accent-cyan-300"/>{playerName(id)} {played.has(id)?"· ya jugó":""}</label>)}</div><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={allowRepeat} onChange={event=>setAllowRepeat(event.target.checked)} className="accent-cyan-300"/> Autorizar repetición antes de que terminen todos</label><button onClick={()=>setGroupChoice([])} className="ghost-action mt-3 px-3 py-2 text-xs">Usar grupo sugerido</button></details>
          <button disabled={busy||!canStartGroup} onClick={()=>void post({action:"startRoblox",activityId,discipline,participantIds:groupCandidates,comparisonKey:comparison,allowRepeat}).then(result=>{if(result)setGroupChoice([])})} className="primary-action w-full py-3 text-xs disabled:opacity-40">▶ TV + voz · Iniciar grupo ({groupCandidates.length})</button>
          {groupCandidates.length===1&&<p className="text-xs text-amber-200">Seleccioná al menos otro jugador para iniciar la competencia.</p>}
          {groups.filter(group=>group.status==="live").map(group=><article key={group.id} className="rounded border border-cyan-300/30 p-4"><b>Grupo en juego</b>{data?.groupPlayers.filter(item=>item.challenge_id===group.id).map(item=><label key={item.participant_id} className="mt-3 flex items-center justify-between gap-3 text-sm"><span>{playerName(item.participant_id)} · {data.stations.find(station=>station.id===item.station_id)?.name}</span><input type="number" min="0" placeholder="Resultado" value={scores[`${group.id}:${item.participant_id}`]??""} onChange={event=>setScores(current=>({...current,[`${group.id}:${item.participant_id}`]:event.target.value}))} className="w-28 rounded bg-black/25 p-2"/></label>)}<button disabled={busy} onClick={()=>void finishGroup(group)} className="ghost-action mt-4 w-full py-2 text-xs">Guardar resultados y liberar PCs</button></article>)}
          <div><h3 className="font-black">Clasificación · {games.find(item=>item[0]===discipline)?.[1]}</h3><p className="mt-1 text-xs text-slate-400">{games.find(item=>item[0]===discipline)?.[2]} · Recorrido: {comparison}</p>{standings.map((item,index)=><div key={item.participant_id} className="mt-2 flex justify-between rounded bg-white/5 px-3 py-2 text-sm"><span>{standings.findIndex(other=>other.score===item.score)+1}º {playerName(item.participant_id)}</span><b>{item.score}</b><span className="sr-only">{index}</span></div>)}</div>
          <div className="border-t border-white/10 pt-4"><h3 className="font-black">Campeonato general Roblox</h3><p className="mt-1 text-xs text-slate-400">Puntos deportivos por puesto. Los empates comparten puntos; no se suman a los XP.</p><div className="mt-3 flex gap-2"><input aria-label="Puntos por puesto" value={scaleText} onChange={event=>setScaleText(event.target.value)} className="min-w-0 flex-1 rounded bg-black/25 p-2 text-sm"/><button disabled={busy} onClick={()=>void saveScale()} className="ghost-action px-3 text-xs">Guardar escala</button></div>{overall.overall.map((item,index)=><div key={item.participantId} className="mt-2 flex justify-between rounded bg-white/5 px-3 py-2 text-sm"><span>{index+1}º {playerName(item.participantId)}</span><b>{item.total} pts</b></div>)}</div>
        </div>:<div className="mt-4">
          {activeTournament?<p className="rounded border border-lime-300/25 p-3 text-sm text-lime-200">Ya hay un torneo activo para este juego.</p>:<>
            <p className="text-sm text-slate-300">{roster.length} seleccionados. El sorteo fija posiciones, aunque algún jugador esté ocupado ahora.</p>
            {activity?.activity_type==="foosball"&&roster.length%2!==0&&<p className="mt-2 rounded border border-amber-300/30 p-3 text-xs text-amber-200">Metegol necesita una cantidad par. Agregá un suplente o dejá un jugador en espera antes del sorteo.</p>}
            <button disabled={busy||roster.length<(activity?.activity_type==="foosball"?4:2)||activity?.activity_type==="foosball"&&roster.length%2!==0} onClick={()=>setPreview(drawOrder(roster,activity?.activity_type==="foosball"))} className="primary-action mt-4 w-full py-3 text-xs disabled:opacity-40">{preview?"Repetir sorteo":"Sortear posiciones"}</button>
            {preview&&<div className="mt-4 space-y-2"><p className="text-xs text-cyan-200">Vista previa. En Metegol cada dos jugadores consecutivos forman un dúo. Ajustá antes de confirmar.</p>{preview.map((id,index)=><div key={id} className="flex items-center justify-between rounded bg-white/5 px-3 py-2 text-sm"><span>{index+1}. {playerName(id)}</span><div className="flex gap-2"><button onClick={()=>move(index,-1)} aria-label={`Subir a ${playerName(id)}`} className="ghost-action px-2">↑</button><button onClick={()=>move(index,1)} aria-label={`Bajar a ${playerName(id)}`} className="ghost-action px-2">↓</button></div></div>)}<button disabled={busy} onClick={()=>void confirm()} className="primary-action w-full py-3 text-xs">Confirmar torneo</button></div>}
          </>}
          {tournament&&<div className="mt-6"><p className="mb-3 text-sm text-cyan-100">Para anunciar jugadores y escuchar sus nombres en la TV, usá «TV + voz» en el enfrentamiento. «Mostrar cuadro» presenta el sorteo completo.</p><h3 className="font-black">{tournament.name} · {tournament.status}</h3><button disabled={busy} onClick={()=>void post({action:"announceDraw",tournamentId:tournament.id})} className="ghost-action mt-3 w-full py-3 text-xs">Mostrar cuadro del sorteo en TV</button>{tournament.champion_entry_id&&<p className="mt-3 text-lime-200">Campeón: {entryPlayers(tournament.champion_entry_id).map(playerName).join(" + ")}</p>}</div>}
        </div>}
      </section>
    </div>
    {activity?.activity_type!=="roblox"&&tournament&&<section className="mt-6"><h2 className="text-2xl font-black">3. Enfrentamientos</h2><p className="mt-2 text-sm text-slate-400">Recomendado: {next?sides(next.id).map(side=>side.map(playerName).join(" + ")).join(" VS "):"Esperando jugadores o recursos libres"}</p><div className="mt-4 grid gap-3 lg:grid-cols-2">{matches.map(matchCard)}</div></section>}
    <section className="panel cut mt-6 p-5"><h2 className="text-xl font-black">Estado del evento</h2><p className="mt-2 text-sm text-slate-400">Tiempo mínimo orientativo: {estimate?String(estimate)+" minutos":"sin partidas pendientes"}. Referencia: FIFA 6 min, Metegol 8 min y Roblox 10 min por grupo.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{allRecommendations.map(item=><div key={item.title} className="rounded border border-cyan-300/20 bg-cyan-300/5 p-3"><b>{item.title}</b><small className="ml-2 text-slate-400">{item.resource}</small><p className="mt-2 text-xs text-cyan-100">{item.next}</p></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{data?.players.map(player=>{const assignment=data.assignments.find(item=>item.participant_id===player.id);const station=data.stations.find(item=>item.id===assignment?.station_id);return <div key={player.id} className="rounded border border-white/10 p-3 text-sm"><b>{player.gamer_tag||player.first_name}</b><small className="mt-1 block text-slate-400">{stateName[player.operational_status]??player.operational_status}{station?" · "+station.name:""}</small></div>})}</div><p className="mt-3 text-xs text-slate-500">La ficha de Jugadores permite cambiar manualmente la disponibilidad.</p></section>
  </main></AppShell>;
}
