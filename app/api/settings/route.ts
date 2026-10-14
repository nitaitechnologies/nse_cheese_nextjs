import { NextResponse } from "next/server";
import { envOptional } from "@/lib/env";
import { unauthorized } from "@/lib/guard";
import { kiteCallbackOrigin } from "@/lib/kite-origin";
import { countInstruments, getKiteSession, getSettings, saveSettings, setPushoverMuted } from "@/lib/store";
import { RETENTION_DAYS } from "@/lib/retention";
import { istDateString, istTimeHM } from "@/lib/time";

async function settingsBody() {
  const [settings, instruments, session] = await Promise.all([
    getSettings(),
    countInstruments(),
    getKiteSession(),
  ]);
  const loginAt = session?.login_time ? new Date(session.login_time) : null;
  return {
    minStrength: settings.minStrength,
    backfillDays: settings.backfillDays,
    pushoverMuted: settings.pushoverMutedDate === istDateString(new Date()),
    instrumentCount: instruments,
    kiteRedirectUrl: kiteCallbackOrigin(envOptional("KITE_REDIRECT_URL"))?.href ?? "",
    kite: {
      connected: Boolean(session?.access_token),
      userId: session?.user_id ?? null,
      userName: session?.user_name ?? null,
      loginTime: loginAt && !Number.isNaN(loginAt.getTime()) ? istTimeHM(loginAt) : null,
    },
  };
}

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  return NextResponse.json(await settingsBody());
}

export async function PUT(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as {
    minStrength?: number;
    backfillDays?: number;
    pushoverMuted?: boolean;
  } | null;
  if (typeof body?.pushoverMuted === "boolean") {
    await setPushoverMuted(body.pushoverMuted);
  }
  if (body?.minStrength == null && body?.backfillDays == null) {
    if (typeof body?.pushoverMuted !== "boolean") {
      return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    }
    return NextResponse.json(await settingsBody());
  }
  const minStrength = Number(body?.minStrength);
  const backfillDays = Number(body?.backfillDays);
  if (!Number.isInteger(minStrength) || minStrength < 1 || minStrength > 5) {
    return NextResponse.json({ error: "Strength must be from 1 to 5" }, { status: 400 });
  }
  if (!Number.isInteger(backfillDays) || backfillDays < 1 || backfillDays > RETENTION_DAYS) {
    return NextResponse.json({ error: `Backfill days must be from 1 to ${RETENTION_DAYS}` }, { status: 400 });
  }
  await saveSettings({ minStrength, backfillDays });
  return NextResponse.json(await settingsBody());
}
