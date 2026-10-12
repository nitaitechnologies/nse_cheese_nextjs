import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { dashboardPasswordHash } from "@/lib/env";
import { cookieBase } from "@/lib/guard";
import { SESSION_COOKIE, signSession } from "@/lib/session";

const attempts = new Map<string, { count: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 8;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Wait and try again." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password ?? "";
  const hash = dashboardPasswordHash();
  if (!hash) {
    return NextResponse.json({ error: "Dashboard password is not configured" }, { status: 500 });
  }
  const matches = await bcrypt.compare(password, hash);
  if (!matches) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const token = await signSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { ...cookieBase(), maxAge: 60 * 60 * 24 * 30 });
  return response;
}
