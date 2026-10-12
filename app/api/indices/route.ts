import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/guard";
import { createIndex, deleteIndex, listIndices, renameIndex } from "@/lib/store";

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const indices = await listIndices();
  return NextResponse.json({ indices });
}

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { symbol?: string; name?: string } | null;
  const symbol = typeof body?.symbol === "string" ? body.symbol : "";
  const name = typeof body?.name === "string" ? body.name : "";
  try {
    const index = await createIndex(symbol, name);
    return NextResponse.json({ index });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add the index";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { symbol?: string; name?: string } | null;
  const symbol = typeof body?.symbol === "string" ? body.symbol : "";
  const name = typeof body?.name === "string" ? body.name : "";
  if (!symbol.trim()) {
    return NextResponse.json({ error: "Missing index" }, { status: 400 });
  }
  try {
    const index = await renameIndex(symbol, name);
    return NextResponse.json({ index });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not rename the index";
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
  try {
    await deleteIndex(symbol);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove the index";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
