import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { countInstruments, searchInstruments } from "@/lib/store";

export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 40) ?? "";
  const [items, count] = await Promise.all([
    searchInstruments(query),
    countInstruments(),
  ]);
  return NextResponse.json({ items, count });
}
