import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { listPiePicks, listProbeRows } from "@/lib/store";
import { sessionDateFromRequest } from "@/lib/time";

export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const [stocks, pies] = await Promise.all([listProbeRows(sessionDateFromRequest(request)), listPiePicks()]);
  return NextResponse.json({ stocks, pies });
}
