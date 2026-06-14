// app/api/match/state/route.js
// Etat du match pour le polling cote client (jeu async).
// On ne revele les SCORES et le RESULTAT que lorsque status === 'finished'.
import { NextResponse } from 'next/server';
import { getMatch } from '../../../../lib/store.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get('matchId');
  const match = await getMatch(matchId);
  if (!match) return NextResponse.json({ error: 'Match introuvable' }, { status: 404 });

  const players = Object.values(match.players).map((p) => ({
    address: p.address,
    finished: p.finished,
    answered: p.answers.length,
    // score masque tant que le duel n'est pas fini
    score: match.status === 'finished' ? p.score : undefined,
  }));

  return NextResponse.json({
    matchId: match.id,
    status: match.status,
    mode: match.mode,
    stake: match.stake,
    players,
    result: match.status === 'finished' ? match.result : null,
  });
}
