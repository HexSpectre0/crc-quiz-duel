// app/api/leaderboard/route.js
import { NextResponse } from 'next/server';
import { leaderboard } from '../../../lib/store.js';

export async function GET() {
  const lb = await leaderboard(20);
  return NextResponse.json({ leaderboard: lb });
}
