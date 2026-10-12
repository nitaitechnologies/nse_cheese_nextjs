import { NextResponse } from "next/server";
import { getDb, readyDb } from "@/lib/sqlite";

export async function GET() {
  try {
    await readyDb();
    getDb().prepare("SELECT 1").get();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
