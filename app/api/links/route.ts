import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { linkStock, unlinkStock } from "@/lib/store";

function readLink(body: { symbol?: string; instrument_token?: number } | null): {
  symbol: string;
  token: number;
} | null {
  const symbol = typeof body?.symbol === "string" ? body.symbol : "";
  const token = Number(body?.instrument_token);
  if (!symbol.trim() || !Number.isInteger(token) || token <= 0) return null;
  return { symbol, token };
}

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const link = readLink((await request.json().catch(() => null)) as { symbol?: string; instrument_token?: number } | null);
  if (!link) {
    return NextResponse.json({ error: "Choose an index and a stock" }, { status: 400 });
  }
  try {
    await linkStock(link.symbol, link.token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not link the stock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const link = readLink((await request.json().catch(() => null)) as { symbol?: string; instrument_token?: number } | null);
  if (!link) {
    return NextResponse.json({ error: "Choose an index and a stock" }, { status: 400 });
  }
  await unlinkStock(link.symbol, link.token);
  return NextResponse.json({ ok: true });
}
