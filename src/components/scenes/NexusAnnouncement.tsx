import Image from "next/image";
import { NexusStandby } from "@/components/tv/NexusStandby";
import type { DisplayPlayer, DisplayScene } from "@/lib/tv/protocol";
import "./NexusAnnouncement.css";

function Player({ player }: { player: DisplayPlayer }) {
  return <div className="nexus-act-player">
    <div className="nexus-act-portrait">
      {player.photoUrl ? <Image unoptimized fill sizes="25vw" src={player.photoUrl} alt={`Foto de ${player.name}`} className="object-cover" /> : <span>{player.name.slice(0, 2).toUpperCase()}</span>}
    </div>
    <strong>{player.gamerTag || player.name}</strong>
    {player.gamerTag && <small>{player.name}</small>}
  </div>;
}

export function NexusAnnouncement({ scene, getSpeechLevel }: { scene: DisplayScene; getSpeechLevel?: () => number }) {
  const p = scene.payload;
  const players = p.winner ? [p.winner] : p.player ? [p.player] : p.players ?? [];
  const hasDetails = players.length > 0 || Boolean(p.items?.length) || Boolean(p.score);
  const versus = ["VERSUS", "VERSUS_SCREEN", "DUO_VERSUS_SCREEN"].includes(scene.scene_type) && players.length >= 2;
  const teams = scene.scene_type === "DUO_VERSUS_SCREEN" && players.length >= 4;
  const title = p.title ?? p.message ?? "NEXUS—9";
  return <div className={`nexus-act ${hasDetails ? "nexus-act-with-details" : ""}`}>
    <div className="nexus-act-face"><NexusStandby speaking getSpeechLevel={getSpeechLevel} /></div>
    <div className={`nexus-act-content ${players.length > 4 ? "nexus-act-many" : ""}`}>
      <header>
        {p.activity && <p className="nexus-act-activity">{p.activity}</p>}
        <h1>{title}</h1>
        {(p.station || p.round) && <p className="nexus-act-meta">{[p.station, p.round].filter(Boolean).join(" · ")}</p>}
        {p.subtitle && <p className="nexus-act-subtitle">{p.subtitle}</p>}
      </header>
      {versus ? <div className="nexus-act-versus">
        <div className={teams ? "nexus-act-team" : ""}>{players.slice(0, teams ? 2 : 1).map((player, index) => <Player key={index} player={player} />)}</div>
        <b className="nexus-act-vs">VS</b>
        <div className={teams ? "nexus-act-team" : ""}>{players.slice(teams ? 2 : 1, teams ? 4 : 2).map((player, index) => <Player key={index} player={player} />)}</div>
      </div> : players.length > 0 && <div className="nexus-act-players" style={{ gridTemplateColumns: `repeat(${Math.min(players.length, players.length > 6 ? 4 : 3)},minmax(0,1fr))` }}>{players.map((player, index) => <Player key={index} player={player} />)}</div>}
      {p.score && <p className="nexus-act-score">{p.score}</p>}
      {p.items && p.items.length > 0 && <div className="nexus-act-items">{p.items.map((item, index) => <p key={index}>{item}</p>)}</div>}
      {p.message && p.title && <p className="nexus-act-subtitle">{p.message}</p>}
    </div>
  </div>;
}
