import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { listPiePicks, listProbeRows } from "@/lib/store";
import { istDateString } from "@/lib/time";

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const [stocks, pies] = await Promise.all([listProbeRows(istDateString(new Date())), listPiePicks()]);
  return NextResponse.json({ stocks, pies });
}
