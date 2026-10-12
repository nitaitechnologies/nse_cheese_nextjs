import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export const SESSION_COOKIE = "nse_session";
export const KITE_STATE_COOKIE = "kite_oauth";

function secretKey(): Uint8Array {
  const secret = env("SESSION_SECRET");
  if (secret.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

export async function signKiteHandoff(): Promise<string> {
  return new SignJWT({ purpose: "kite-handoff" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secretKey());
}

export async function verifyKiteHandoff(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.purpose === "kite-handoff";
  } catch {
    return false;
  }
}
