// app/api/match/answer/route.js
// Correction COTE SERVEUR. Le client envoie (choiceIndex, ms) ; le serveur
// decide si c'est juste et calcule les points. C'est le coeur anti-triche.
import { NextResponse } from 'next/server';
import { submitAnswer } from '../../../../lib/game.js';
import { getMatch, saveMatch, recordResult } from '../../../../lib/store.js';

export async function POST(req) {
  try {
    const { matchId, address, qIndex, choiceIndex, ms } = await req.json();
    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: 'Match introuvable' }, { status: 404 });

    const res = submitAnswer(match, address, Number(qIndex), Number(choiceIndex), Number(ms));

    // When the match just finished, record the result (reputation + debt) —
    // but NEVER for practice matches (the bot must not enter the leaderboard
    // and no real debt is created against a bot).
    if (
      match.status === 'finished' &&
      match.result &&
      !match.result._recorded &&
      match.mode !== 'practice'
    ) {
      await recordResult({ winner: match.result.winner, loser: match.result.loser, stake: match.stake });
      match.result._recorded = true;
    }
    await saveMatch(match);

    return NextResponse.json({
      correct: res.correct,
      points: res.points,
      finished: res.finished,
      matchStatus: match.status,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
