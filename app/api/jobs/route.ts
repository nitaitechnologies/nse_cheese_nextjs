import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { enqueueJob, getSettings, latestJob } from "@/lib/store";

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const job = await latestJob();
  return NextResponse.json({ job });
}

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as {
    type?: "backfill" | "instruments";
    days?: number;
  } | null;
  if (body?.type === "instruments") {
    const job = await enqueueJob("instruments");
    return NextResponse.json({ job });
  }
  if (body?.type === "backfill") {
    const settings = await getSettings();
    const days = Number(body.days ?? settings.backfillDays);
    if (!Number.isInteger(days) || days < 1 || days > 400) {
      return NextResponse.json({ error: "Backfill days must be from 1 to 400" }, { status: 400 });
    }
    const job = await enqueueJob("backfill", days);
    return NextResponse.json({ job });
  }
  return NextResponse.json({ error: "Unknown job" }, { status: 400 });
}
