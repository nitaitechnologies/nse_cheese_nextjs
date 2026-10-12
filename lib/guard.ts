import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "./session";

export async function unauthorized(): Promise<NextResponse | null> {
  const jar = await cookies();
  const ok = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (ok) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
