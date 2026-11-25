import Link from "next/link";
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
        <p className="eyebrow">SANTIAGO LEVEL 9 · CONTROL DE ACCESO</p>
        <h1>OPERADOR IDENTIFICADO</h1>
        <p>Ingresá con una cuenta autorizada de Supabase.</p>
        <LoginForm next={params.next} />
        <Link href="/">Volver al portal</Link>
      </section>
    </main>
  );
}

