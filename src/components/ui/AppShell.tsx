import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

type Props={children:ReactNode;active?:"admin"|"checkin"|"tv"|"mission";compact?:boolean};
const links=[["admin","/admin","Control"],["checkin","/checkin","Check-in"],["tv","/tv","TV"],["mission","/mission","Misión"]] as const;
export function AppShell({children,active,compact=false}:Props){return <main className="grid-stage min-h-screen">{!compact&&<header className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 px-5 py-5 md:px-8"><Link href="/" className="flex items-center gap-3" aria-label="Santiago Level 9"><span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-cyan-300/60 shadow-[0_0_18px_rgba(0,217,255,.25)]"><Image src="/assets/branding/santiago-gamer.png" alt="Santiago gamer" fill sizes="44px" className="object-cover" priority/></span><span><b className="block text-sm tracking-[.16em]">SANTIAGO</b><small className="eyebrow !text-[.55rem]">Game center</small></span></Link><nav className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/50 p-1" aria-label="Interfaces">{links.map(([key,href,label])=><Link key={key} href={href} className={`rounded-md px-3 py-2 text-xs font-bold transition md:px-4 ${active===key?"bg-cyan-300 text-slate-950":"text-slate-300 hover:bg-white/5 hover:text-white"}`}>{label}</Link>)}</nav></header>}{children}</main>}

