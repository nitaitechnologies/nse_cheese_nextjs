import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { addStock, listStockBoard, removeStock, replaceStockInstrument } from "@/lib/store";
import { istDateString } from "@/lib/time";

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const stocks = await listStockBoard(istDateString(new Date()));
  return NextResponse.json({ stocks });
}

export async function PATCH(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as {
    instrument_token?: number;
    next_token?: number;
  } | null;
  const token = Number(body?.instrument_token);
  const next = Number(body?.next_token);
  if (!Number.isInteger(token) || token <= 0 || !Number.isInteger(next) || next <= 0) {
    return NextResponse.json({ error: "Choose a symbol from the list" }, { status: 400 });
  }
  try {
    const stock = await replaceStockInstrument(token, next);
    return NextResponse.json({ stock });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not change the symbol";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { instrument_token?: number } | null;
  const token = Number(body?.instrument_token);
  if (!Number.isInteger(token) || token <= 0) {
    return NextResponse.json({ error: "Choose a symbol from the list" }, { status: 400 });
  }
  try {
    const stock = await addStock(token);
    return NextResponse.json({ stock });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add the stock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { instrument_token?: number } | null;
  const token = Number(body?.instrument_token);
  if (!Number.isInteger(token) || token <= 0) {
    return NextResponse.json({ error: "Missing stock" }, { status: 400 });
  }
  try {
    await removeStock(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove the stock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
