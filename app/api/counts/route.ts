import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { listDeskCounts } from "@/lib/store";
import { sessionDateFromRequest } from "@/lib/time";

export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const counts = await listDeskCounts(sessionDateFromRequest(request));
  return NextResponse.json(counts);
}
