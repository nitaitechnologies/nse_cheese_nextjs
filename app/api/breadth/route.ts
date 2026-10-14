import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { dashboardBreadth, indexCardsForInstrument } from "@/lib/store";
import { sessionDateFromRequest } from "@/lib/time";

export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const url = new URL(request.url);
  const date = sessionDateFromRequest(request);
  const tokenRaw = url.searchParams.get("token");
  if (tokenRaw) {
    const token = Number(tokenRaw);
    if (!Number.isInteger(token) || token <= 0) {
      return NextResponse.json({ error: "Unknown symbol" }, { status: 400 });
    }
    const indices = await indexCardsForInstrument(token, date);
    return NextResponse.json({ indices });
  }
  return NextResponse.json(await dashboardBreadth(date));
}
