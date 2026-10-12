"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">NSE cash</p>
      <h1 className="mt-2 text-3xl font-semibold">Breakouts</h1>
      <p className="mt-2 text-sm text-muted">Sign in to the 5-minute high and low desk.</p>
      <form onSubmit={(event) => void submit(event)} className="mt-8">
        <label className="text-sm text-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3"
        />
        {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
        <button
          className="mt-4 min-h-12 w-full rounded-xl bg-gold font-semibold text-ink disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
