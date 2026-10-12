import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env, envOptional } from "@/lib/env";
import { cookieBase, unauthorized } from "@/lib/guard";
import { browserUrl, kiteCallbackOrigin } from "@/lib/kite-origin";
import { KITE_STATE_COOKIE } from "@/lib/session";
import { saveKiteSession } from "@/lib/store";
import { createKite } from "../../../../worker/kite";

export async function GET(request: Request) {
  const denied = await unauthorized();
  const current = browserUrl(request, kiteCallbackOrigin(envOptional("KITE_REDIRECT_URL")));
  const settings = new URL("/settings", current.origin);
  if (denied) {
    settings.pathname = "/login";
    return NextResponse.redirect(settings);
  }
  const url = new URL(request.url);
  const jar = await cookies();
  const state = jar.get(KITE_STATE_COOKIE)?.value;
  if (!state) {
    settings.searchParams.set("kite", "error");
    settings.searchParams.set("reason", "Login expired. Start the Kite connection again.");
    return NextResponse.redirect(settings);
  }
  if (url.searchParams.get("status") && url.searchParams.get("status") !== "success") {
    settings.searchParams.set("kite", "error");
    settings.searchParams.set("reason", "Kite login was cancelled.");
    return clearState(NextResponse.redirect(settings));
  }
  const requestToken = url.searchParams.get("request_token");
  if (!requestToken) {
    settings.searchParams.set("kite", "error");
    settings.searchParams.set("reason", "Kite did not return a request token.");
    return clearState(NextResponse.redirect(settings));
  }
  try {
    const session = await createKite().generateSession(requestToken, env("KITE_API_SECRET"));
    await saveKiteSession({
      accessToken: session.access_token,
      userId: session.user_id,
      userName: session.user_name,
      loginTime: new Date(),
    });
    settings.searchParams.set("kite", "connected");
    return clearState(NextResponse.redirect(settings));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Kite session exchange failed";
    settings.searchParams.set("kite", "error");
    settings.searchParams.set("reason", reason.slice(0, 180));
    return clearState(NextResponse.redirect(settings));
  }
}

function clearState(response: NextResponse): NextResponse {
  response.cookies.set(KITE_STATE_COOKIE, "", { ...cookieBase(), maxAge: 0 });
  return response;
}
