"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";

export type LoginState = { error?: string; notice?: string };

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  next: z.string().startsWith("/").default("/admin"),
  mode: z.enum(["login", "register"]).default("login"),
});

export async function login(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!hasSupabasePublicConfig()) {
    return { error: "Supabase todavía no está configurado. Usá el modo demo local." };
  }

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el correo y la contraseña." };

  const supabase = await createClient();
  if (parsed.data.mode === "register") {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: process.env.APP_URL ? { emailRedirectTo: `${process.env.APP_URL.replace(/\/$/, "")}/admin` } : undefined,
    });
    if (error) return { error: error.message.includes("already") ? "Esa cuenta ya existe. Probá ingresar." : "No se pudo crear la cuenta de administrador." };
    if (!data.session) return { notice: "Cuenta creada. Revisá tu correo para confirmar el acceso y después ingresá." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return { error: "No se pudo iniciar sesión con esas credenciales." };
  }

  redirect(parsed.data.next);
}

