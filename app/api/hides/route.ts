import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { hideStock, unhideStock } from "@/lib/store";
import { clampSessionDate } from "@/lib/time";

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { instrument_token?: number; date?: string } | null;
  const token = Number(body?.instrument_token);
  if (!Number.isInteger(token) || token <= 0) {
    return NextResponse.json({ error: "Choose a stock from the list" }, { status: 400 });
  }
  try {
    await hideStock(token, clampSessionDate(body?.date));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not hide the stock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { instrument_token?: number; date?: string } | null;
  const token = Number(body?.instrument_token);
  if (!Number.isInteger(token) || token <= 0) {
    return NextResponse.json({ error: "Missing stock" }, { status: 400 });
  }
  await unhideStock(token, clampSessionDate(body?.date));
  return NextResponse.json({ ok: true });
}
