import Image from "next/image";
import type { DisplayPlayer } from "@/lib/tv/protocol";

function Contestant({ player }: { player: DisplayPlayer }) {
  return <div className="min-w-0 text-center">
    <div className="relative mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-300 to-violet-500 text-4xl font-black text-slate-950">
      {player.photoUrl?<Image unoptimized fill sizes="112px" src={player.photoUrl} alt={`Foto de ${player.name}`} className="object-cover"/>:player.name.slice(0,2).toUpperCase()}
    </div>
    <p className="mt-3 truncate text-xl font-black text-white">{player.gamerTag||player.name}</p>
    {player.gamerTag&&<p className="text-xs text-slate-400">{player.name}</p>}
  </div>;
}

export function DuoVersusScene({ players, activity }: { players: DisplayPlayer[]; activity?: string }) {
  if(players.length<4)return null;
  return <div className="grid h-full place-items-center px-8 text-center">
    <div className="w-full max-w-7xl"><p className="eyebrow">{activity??"Metegol Duo Cup"}</p>
      <h1 className="display-title mt-3 text-5xl text-cyan-200">PRÓXIMO ENFRENTAMIENTO</h1>
      <div className="mt-10 grid grid-cols-[1fr_auto_1fr] items-center gap-5">
        <div className="grid grid-cols-2 gap-4"><Contestant player={players[0]}/><Contestant player={players[1]}/></div>
        <strong className="neon-text display-title text-7xl text-cyan-300">VS</strong>
        <div className="grid grid-cols-2 gap-4"><Contestant player={players[2]}/><Contestant player={players[3]}/></div>
      </div>
    </div>
  </div>;
}

export function TournamentBracketScene({ title, items, players=[] }: { title?: string; items: string[]; players?: DisplayPlayer[] }) {
  return <div className="grid h-full place-items-center px-8 text-center">
    <div className="w-full max-w-6xl"><p className="eyebrow">NEXUS-9 · SORTEO CONFIRMADO</p>
      <h1 className="display-title mt-3 text-5xl text-cyan-200">{title??"CUADRO DEL TORNEO"}</h1>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{players.map((player,index)=><div key={index} className="relative h-12 w-12 overflow-hidden rounded-full border border-cyan-300/40 bg-cyan-300/10" title={player.gamerTag||player.name}>{player.photoUrl?<Image unoptimized fill sizes="48px" src={player.photoUrl} alt={player.name} className="object-cover"/>:<span className="grid h-full place-items-center text-sm font-black">{player.name.slice(0,2).toUpperCase()}</span>}</div>)}</div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">{items.map((item,index)=><div key={index} className="rounded-xl border border-cyan-300/25 bg-cyan-300/5 px-5 py-4 text-xl font-black animate-[fadeIn_500ms_ease-out_both]" style={{animationDelay:`${index*300}ms`}}><small className="mr-3 text-cyan-300">#{index+1}</small>{item}</div>)}</div>
    </div>
  </div>;
}

export function RobloxCallScene({ players, items, activity }: { players: DisplayPlayer[]; items: string[]; activity?: string }) {
  return <div className="grid h-full place-items-center px-8 text-center"><div className="w-full max-w-6xl">
    <p className="eyebrow">NEXUS-9 · ROBLOX QUEST ARENA</p>
    <h1 className="display-title mt-3 text-5xl text-cyan-200">{activity??"PRÓXIMO DESAFÍO"}</h1>
    <div className="mt-10 grid gap-5" style={{gridTemplateColumns:`repeat(${Math.max(1,Math.min(3,players.length))},minmax(0,1fr))`}}>{players.map((player,index)=><div key={index} className="rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-5"><Contestant player={player}/><p className="mt-4 text-sm font-black text-lime-200">{items[index]?.split(" · ").at(-1)??"PC"}</p></div>)}</div>
  </div></div>;
}
