"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next = "/admin" }: { next?: string }) {
  const [state, action, pending] = useActionState(login, initialState);
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <form action={action} className="login-form">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="mode" value={mode} />
      <label>
        Correo del operador
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </label>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.notice ? <p role="status">{state.notice}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "CONECTANDO…" : mode === "login" ? "INGRESAR AL GAME CENTER" : "CREAR CUENTA DE ADMINISTRADOR"}
      </button>
      <button type="button" className="ghost-action mt-3 w-full px-4 py-3 text-xs" onClick={() => setMode((current) => current === "login" ? "register" : "login")}>
        {mode === "login" ? "Primera vez: crear acceso" : "Ya tengo cuenta: ingresar"}
      </button>
    </form>
  );
}

