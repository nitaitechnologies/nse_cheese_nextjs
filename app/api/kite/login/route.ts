import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { envOptional } from "@/lib/env";
import { cookieBase, unauthorized } from "@/lib/guard";
import { browserUrl, kiteCallbackOrigin } from "@/lib/kite-origin";
import { KITE_STATE_COOKIE, SESSION_COOKIE, signKiteHandoff, signSession, verifyKiteHandoff } from "@/lib/session";
import { createKite } from "../../../../worker/kite";

export async function GET(request: Request) {
  const callback = kiteCallbackOrigin(envOptional("KITE_REDIRECT_URL"));
  const current = browserUrl(request, callback);
  const handoff = new URL(request.url).searchParams.get("handoff");
  let establishSession = false;

  if (new URL(request.url).searchParams.has("handoff")) {
    if (!(await verifyKiteHandoff(handoff ?? undefined))) {
      return NextResponse.redirect(new URL("/login", current));
    }
    establishSession = true;
  } else {
    const denied = await unauthorized();
    if (denied) return denied;
    if (callback && callback.host !== current.host) {
      const next = new URL("/api/kite/login", callback.origin);
      next.searchParams.set("handoff", await signKiteHandoff());
      return NextResponse.redirect(next);
    }
  }

  try {
    const url = createKite().getLoginURL();
    const state = randomBytes(24).toString("hex");
    const response = NextResponse.redirect(url);
    if (establishSession) {
      response.cookies.set(SESSION_COOKIE, await signSession(), {
        ...cookieBase(),
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    response.cookies.set(KITE_STATE_COOKIE, state, { ...cookieBase(), maxAge: 10 * 60 });
    return response;
  } catch (error) {
    const settings = new URL("/settings", current.origin);
    const reason = error instanceof Error ? error.message : "Kite is not configured";
    settings.searchParams.set("kite", "error");
    settings.searchParams.set("reason", reason.slice(0, 180));
    return NextResponse.redirect(settings);
  }
}
