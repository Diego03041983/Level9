import Link from "next/link";
import Image from "next/image";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="relative mx-auto mb-5 h-24 w-24 overflow-hidden rounded-2xl border border-cyan-300/60 shadow-[0_0_30px_rgba(0,217,255,.25)]">
          <Image src="/assets/branding/santiago-gamer.png" alt="Santiago gamer" fill sizes="96px" className="object-cover" priority />
        </div>
        <p className="eyebrow">SANTIAGO LEVEL 9 · CONTROL DE ACCESO</p>
        <h1>OPERADOR IDENTIFICADO</h1>
        <p>Ingresá con una cuenta autorizada de Supabase.</p>
        <LoginForm next={params.next} />
        <Link href="/">Volver al portal</Link>
      </section>
    </main>
  );
}

