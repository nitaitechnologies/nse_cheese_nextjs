"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, endSession } from "./api";
import type { JobDoc } from "@/lib/types";

type SettingsBody = {
  minStrength: number;
  backfillDays: number;
  pushoverMuted: boolean;
  instrumentCount: number;
  kiteRedirectUrl: string;
  kite: {
    connected: boolean;
    userId: string | null;
    userName: string | null;
    loginTime: string | null;
  };
};

type JobBody = { job: (JobDoc & { _id: string }) | null };

export default function Settings() {
  const params = useSearchParams();
  const [settings, setSettings] = useState<SettingsBody | null>(null);
  const [job, setJob] = useState<JobBody["job"]>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [muteBusy, setMuteBusy] = useState(false);

  async function load() {
    const [nextSettings, nextJob] = await Promise.all([
      api<SettingsBody>("/api/settings"),
      api<JobBody>("/api/jobs"),
    ]);
    setSettings(nextSettings);
    setJob(nextJob.job);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load setup"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    const timer = window.setInterval(() => {
      void api<JobBody>("/api/jobs")
        .then((body) => setJob(body.job))
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job]);

  async function setMuted(muted: boolean) {
    setError("");
    setMuteBusy(true);
    try {
      const next = await api<SettingsBody>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ pushoverMuted: muted }),
      });
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update notifications");
    } finally {
      setMuteBusy(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaved("");
    setError("");
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          minStrength: Number(settings.minStrength),
          backfillDays: Number(settings.backfillDays),
        }),
      });
      setSaved("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function start(type: "backfill" | "instruments") {
    if (!settings) return;
    setError("");
    try {
      const body = await api<JobBody>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ type, days: Number(settings.backfillDays) }),
      });
      setJob(body.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the job");
    }
  }

  async function logout() {
    setError("");
    try {
      await endSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log out");
    }
  }

  const connected = Boolean(settings?.kite.connected);
  const kiteError = params.get("kite") === "error" ? params.get("reason") || "Kite login failed." : "";
  const who = settings?.kite.userName || settings?.kite.userId;

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-semibold">Setup</h1>
      {connected ? (
        <div className="mt-4 rounded-2xl border border-line bg-panel px-4 py-3">
          <p className="text-sm font-medium text-up">Connected for today</p>
          {who || settings?.kite.loginTime ? (
            <p className="mt-1 text-xs text-muted">
              {[who, settings?.kite.loginTime ? `since ${settings.kite.loginTime} IST` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
      <a
        href="/api/kite/login"
        className={
          connected
            ? "mt-3 flex min-h-12 items-center justify-center rounded-xl border border-line font-semibold"
            : "mt-4 flex min-h-12 items-center justify-center rounded-xl bg-gold font-semibold text-ink"
        }
      >
        {connected ? "Reconnect" : "Connect Kite"}
      </a>
      {kiteError ? <p className="mt-3 text-sm text-gold">{kiteError}</p> : null}
      <p className="mt-3 text-xs text-muted">
        {settings
          ? `Redirect URL registered in the Kite app: ${settings.kiteRedirectUrl || "set KITE_REDIRECT_URL"}`
          : "Loading setup…"}
      </p>
      {settings ? (
        <p className="mt-1 text-xs text-muted">
          {settings.instrumentCount.toLocaleString("en-IN")} instruments stored
        </p>
      ) : null}
      {settings ? (
        <div className="mt-6 rounded-2xl border border-line bg-panel px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Pushover today</p>
              <p className="mt-1 text-xs text-muted">
                {settings.pushoverMuted
                  ? "Off for today. Break alerts turn back on tomorrow. The 8:45 Kite reminder still sends."
                  : "On for this session. Turn it off to silence break alerts until tomorrow."}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={!settings.pushoverMuted}
              disabled={muteBusy}
              className={
                settings.pushoverMuted
                  ? "min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm text-muted"
                  : "min-h-11 shrink-0 rounded-xl bg-gold px-4 text-sm font-semibold text-ink"
              }
              onClick={() => void setMuted(!settings.pushoverMuted)}
            >
              {settings.pushoverMuted ? "Off" : "On"}
            </button>
          </div>
        </div>
      ) : null}
      <label className="mt-6 block text-sm text-muted" htmlFor="strength">
        Pushover from strength
      </label>
      <select
        id="strength"
        className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3"
        value={settings?.minStrength ?? 3}
        onChange={(event) =>
          setSettings((current) =>
            current ? { ...current, minStrength: Number(event.target.value) } : current,
          )
        }
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <label className="mt-4 block text-sm text-muted" htmlFor="days">
        Backfill days
      </label>
      <input
        id="days"
        type="number"
        min={1}
        max={400}
        value={settings?.backfillDays ?? 30}
        onChange={(event) =>
          setSettings((current) =>
            current ? { ...current, backfillDays: Number(event.target.value) } : current,
          )
        }
        className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3"
      />
      <button className="mt-3 min-h-12 w-full rounded-xl border border-line" onClick={() => void save()}>
        Save settings
      </button>
      {saved ? <p className="mt-2 text-sm text-up">{saved}</p> : null}
      <button className="mt-3 min-h-12 w-full rounded-xl border border-line" onClick={() => void start("backfill")}>
        Backfill prices
      </button>
      <button className="mt-3 min-h-12 w-full rounded-xl border border-line" onClick={() => void start("instruments")}>
        Refresh instruments
      </button>
      {job ? (
        <p className="mt-3 text-sm text-muted">
          {job.status}: {job.progress?.message || job.error || "Waiting"}
          {job.progress?.total ? ` (${job.progress.done}/${job.progress.total})` : ""}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      <button
        type="button"
        className="mt-8 min-h-12 w-full rounded-xl border border-line text-down"
        onClick={() => void logout()}
      >
        Log out
      </button>
    </main>
  );
}
