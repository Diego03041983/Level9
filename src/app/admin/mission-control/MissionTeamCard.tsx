"use client";

import {useState} from "react";

type Participant={id:string;first_name:string;gamer_tag:string|null;player_number:number};

export function MissionTeamCard({slot,name,participants,assigned,occupiedBy,busy,digit,onSave}:{
  slot:number;
  name:string;
  participants:Participant[];
  assigned:string[];
  occupiedBy:Map<string,string>;
  busy:boolean;
  digit:string|null;
  onSave:(slot:number,memberIds:string[])=>Promise<void>;
}){
  const[draft,setDraft]=useState<string[]|null>(null);
  const[status,setStatus]=useState("");
  const selected=draft??assigned;
  const changed=selected.length!==assigned.length||selected.some(id=>!assigned.includes(id));
  const toggle=(id:string)=>{
    setDraft(previous=>{
      const current=previous??assigned;
      return current.includes(id)?current.filter(value=>value!==id):[...current,id];
    });
    setStatus("");
  };
  const save=async()=>{
    try{
      await onSave(slot,selected);
      setDraft(null);
      setStatus(selected.length?`${selected.length} ${selected.length===1?"integrante guardado":"integrantes guardados"}`:`Equipo ${name} vaciado`);
    }catch(error){setStatus(error instanceof Error?error.message:"No se pudo guardar el equipo")}
  };
  return <section className="panel cut p-5">
    <h3 className="text-xl font-black">Equipo {name} <span className="text-cyan-300">{digit??"🔒"}</span></h3>
    <p className="mt-2 text-xs text-slate-400">{assigned.length} guardados · {selected.length} seleccionados</p>
    <div className="mt-3 grid max-h-48 grid-cols-2 gap-2 overflow-auto">
      {participants.map(player=>{
        const otherTeam=occupiedBy.get(player.id);
        const unavailable=Boolean(otherTeam&&otherTeam!==name);
        const selectedHere=selected.includes(player.id);
        return <button key={player.id} type="button" disabled={busy||unavailable} aria-pressed={selectedHere} onClick={()=>toggle(player.id)} className={`rounded border p-2 text-left text-xs ${unavailable?"cursor-not-allowed border-white/5 text-slate-500 opacity-60":selectedHere?"border-cyan-300 bg-cyan-300/10":"border-white/10"}`}>
          <span className="block">#{player.player_number} {player.gamer_tag||player.first_name}</span>
          {unavailable&&<small className="text-[10px]">En equipo {otherTeam}</small>}
        </button>;
      })}
    </div>
    <button type="button" disabled={busy||!changed} onClick={()=>void save()} className="ghost-action mt-3 px-4 py-2 disabled:opacity-40">{!changed?"Asignación ya guardada":selected.length?`Guardar ${selected.length} ${selected.length===1?"integrante":"integrantes"}`:"Vaciar equipo"}</button>
    {status&&<p role="status" className="mt-2 text-xs text-cyan-200">{status}</p>}
  </section>;
}
