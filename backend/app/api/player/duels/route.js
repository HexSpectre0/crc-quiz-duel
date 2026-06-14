// app/api/player/duels/route.js
// Returns everything the home screen needs about a player on (re)connect:
//  - active duels (waiting for them, or waiting for the opponent)
//  - finished duels where THEY lost and haven't settled (the blocking debt)
import { NextResponse } from 'next/server';
import { getMatchesForPlayer } from '../../../../lib/store.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get('address') || '').toLowerCase();
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

  const matches = await getMatchesForPlayer(address);

  const active = [];
  const debts = [];

  for (const m of matches) {
    const me = m.players[address];
    if (!me) continue;

    if (m.status === 'finished' && m.result) {
      // Did I lose and not settle yet? -> a blocking debt.
      const iLost = m.result.loser === address;
      if (iLost && !m.result.settled) {
        debts.push({
          matchId: m.id,
          stake: m.stake,
          winner: m.result.winner,
          mode: m.mode,
        });
      }
      continue;
    }

    // Not finished -> active duel. Whose turn?
    const iFinished = !!me.finished;
    const others = Object.values(m.players).filter((p) => p.address !== address);
    const opponentJoined = others.length > 0;
    const opponentFinished = opponentJoined && others.every((p) => p.finished);

    active.push({
      matchId: m.id,
      stake: m.stake,
      mode: m.mode,
      yourTurn: !iFinished,                  // you still have questions to answer
      waitingForOpponent: iFinished && !opponentFinished,
      opponentJoined,
    });
  }

  return NextResponse.json({ active, debts });
}
