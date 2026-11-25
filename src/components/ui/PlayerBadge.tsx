type Props={name:string;number:number;color?:"cyan"|"lime"|"violet"|"gold";size?:"sm"|"lg"};
const tones={cyan:"from-cyan-300 to-blue-500",lime:"from-lime-300 to-emerald-500",violet:"from-violet-400 to-fuchsia-600",gold:"from-yellow-300 to-orange-500"};
export function PlayerBadge({name,number,color="cyan",size="sm"}:Props){const initials=name.split(" ").map((part)=>part[0]).join("").slice(0,2);return <div className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br ${tones[color]} font-black text-slate-950 ${size==="lg"?"h-28 w-28 text-3xl md:h-36 md:w-36":"h-11 w-11 text-sm"}`}><span className="absolute right-1.5 top-1 font-mono text-[9px] opacity-60">#{String(number).padStart(2,"0")}</span>{initials}</div>}

