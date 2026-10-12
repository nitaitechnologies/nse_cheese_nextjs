import { KiteConnect, type Connect } from "kiteconnect";
import { env } from "../lib/env";

let accessToken: string | null = null;
let tail: Promise<void> = Promise.resolve();
let nextAt = 0;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function currentAccessToken(): string | null {
  return accessToken;
}

export function createKite(token?: string): Connect {
  const kc = new KiteConnect({ api_key: env("KITE_API_KEY") });
  if (token) kc.setAccessToken(token);
  return kc;
}

export function kiteCall<T>(fn: (kc: Connect) => Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    const wait = Math.max(0, nextAt - Date.now());
    if (wait) await delay(wait);
    nextAt = Date.now() + 400;
    if (!accessToken) throw new Error("Kite is not authenticated");
    return fn(createKite(accessToken));
  });
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
