"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next = "/admin" }: { next?: string }) {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="login-form">
      <input type="hidden" name="next" value={next} />
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
      <button type="submit" disabled={pending}>
        {pending ? "CONECTANDO…" : "INGRESAR AL GAME CENTER"}
      </button>
    </form>
  );
}

