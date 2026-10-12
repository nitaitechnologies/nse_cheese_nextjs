import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { addPiePick, listPiePicks, removePiePick } from "@/lib/store";

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const pies = await listPiePicks();
  return NextResponse.json({ pies });
}

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { symbol?: string } | null;
  const symbol = typeof body?.symbol === "string" ? body.symbol : "";
  if (!symbol.trim()) {
    return NextResponse.json({ error: "Choose an index" }, { status: 400 });
  }
  try {
    const saved = await addPiePick(symbol);
    return NextResponse.json({ symbol: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store the pie";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { symbol?: string } | null;
  const symbol = typeof body?.symbol === "string" ? body.symbol : "";
  if (!symbol.trim()) {
    return NextResponse.json({ error: "Missing index" }, { status: 400 });
  }
  await removePiePick(symbol);
  return NextResponse.json({ ok: true });
}
