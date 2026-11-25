"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";

export type LoginState = { error?: string };

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  next: z.string().startsWith("/").default("/admin"),
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "No se pudo iniciar sesión con esas credenciales." };

  redirect(parsed.data.next);
}

