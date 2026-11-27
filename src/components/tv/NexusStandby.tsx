import './NexusStandby.css';

export function NexusStandby(){
  return <div className={"nexus-space"} aria-label="NEXUS presente, esperando la próxima actividad">
    <div className={"nexus-aurora"}/><div className={"nexus-grid"}/>
    <div className={"nexus-stars"}>{Array.from({length:20},(_,i)=><i key={i} style={{left:`${(i*37+7)%100}%`,top:`${(i*23+11)%100}%`,animationDelay:`-${i*.7}s`}}/>)}</div>
    <div className={"nexus-system"}>
      <div className={"nexus-orbit"}/><div className={`${"nexus-orbit"} ${"nexus-second"}`}/><div className={`${"nexus-orbit"} ${"nexus-third"}`}/>
      <div className={"nexus-pulse"}/><div className={"nexus-core"}><span>N<span className={"nexus-nine"}>9</span></span></div>
    </div>
    <div className={"nexus-identity"}><p>N E X U S — 9</p><span>CONEXIÓN ESTABLECIDA · SISTEMA EN LÍNEA</span><div className={"nexus-signal"}>{Array.from({length:13},(_,i)=><i key={i} style={{animationDelay:`-${i*.13}s`}}/>)}</div>
  </div></div>;
}
