// app/api/admin/reset/route.js
// Wipes ALL app data (matches, player indexes, reputation, leaderboard) from
// the SAME Redis the app uses — so there's no "wrong database" ambiguity.
// Protected by a secret key. TEMPORARY: remove before final submission, or
// keep but rotate the key. Call once:
//   /api/admin/reset?key=YOUR_SECRET
import { NextResponse } from 'next/server';

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const RESET_KEY = process.env.RESET_KEY || 'letmereset';

async function redis(command) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  return (await res.json()).result;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('key') !== RESET_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!URL || !TOKEN) {
    return NextResponse.json({ error: 'Redis not configured (using in-memory store)' }, { status: 400 });
  }
  try {
    // FLUSHDB on the exact DB the REST credentials point to.
    const result = await redis(['FLUSHDB']);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
