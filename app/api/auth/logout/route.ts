import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieBase } from "@/lib/guard";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    ...cookieBase(),
    expires: new Date(0),
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
