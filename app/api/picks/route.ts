import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { addPick, clearPicks, listPickRows, listPiePicks, removePick } from "@/lib/store";
import { istDateString } from "@/lib/time";

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const [stocks, pies] = await Promise.all([listPickRows(istDateString(new Date())), listPiePicks()]);
  return NextResponse.json({ stocks, pies });
}

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { instrument_token?: number } | null;
  const token = Number(body?.instrument_token);
  if (!Number.isInteger(token) || token <= 0) {
    return NextResponse.json({ error: "Choose a stock from the list" }, { status: 400 });
  }
  try {
    const pick = await addPick(token);
    return NextResponse.json({ pick });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store the stock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as {
    instrument_token?: number;
    all?: boolean;
  } | null;
  if (body?.all === true) {
    await clearPicks();
    return NextResponse.json({ ok: true });
  }
  const token = Number(body?.instrument_token);
  if (!Number.isInteger(token) || token <= 0) {
    return NextResponse.json({ error: "Missing stock" }, { status: 400 });
  }
  await removePick(token);
  return NextResponse.json({ ok: true });
}
