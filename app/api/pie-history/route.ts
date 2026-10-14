import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { listPieHistory } from "@/lib/store";
import { sessionDateFromRequest } from "@/lib/time";

export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const date = sessionDateFromRequest(request);
  const symbol = new URL(request.url).searchParams.get("symbol");
  try {
    const pies = await listPieHistory(date, symbol);
    return NextResponse.json({ pies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the replay";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
