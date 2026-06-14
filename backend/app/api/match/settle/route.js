// app/api/match/settle/route.js
// Marks a match as settled by the loser (after on-chain transfer).
// For the hackathon we trust the client's txHash; for production you'd verify
// the transfer on-chain before clearing the unsettled flag.
import { NextResponse } from 'next/server';
import { getMatch, saveMatch, markSettled } from '../../../../lib/store.js';

export async function POST(req) {
  try {
    const { matchId, loser, txHash } = await req.json();
    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (match.result) {
      match.result.settled = true;
      match.result.txHash = txHash || null;
    }
    await markSettled(loser);
    await saveMatch(match);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
