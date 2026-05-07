import { NextResponse } from 'next/server';
import { getSql } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getSql()`SELECT 1`;
    return NextResponse.json({ ok: true, db: 'up' }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
  }
}

export async function HEAD() {
  try {
    await getSql()`SELECT 1`;
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
