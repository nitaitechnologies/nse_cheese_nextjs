import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { addDeskPie, removeDeskPie } from "@/lib/store";

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { symbol?: string } | null;
  const symbol = typeof body?.symbol === "string" ? body.symbol : "";
  if (!symbol.trim()) {
    return NextResponse.json({ error: "Choose an index" }, { status: 400 });
  }
  try {
    const saved = await addDeskPie(symbol);
    return NextResponse.json({ symbol: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add the index";
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
  await removeDeskPie(symbol);
  return NextResponse.json({ ok: true });
}
