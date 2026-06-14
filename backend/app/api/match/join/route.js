// app/api/match/join/route.js
import { NextResponse } from 'next/server';
import { joinMatch, getQuestionsForMatch, publicQuestion, config } from '../../../../lib/game.js';
import { getMatch, saveMatch } from '../../../../lib/store.js';

export async function POST(req) {
  try {
    const { matchId, opponent } = await req.json();
    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: 'Match introuvable' }, { status: 404 });
    joinMatch(match, opponent);
    await saveMatch(match);
    const questions = getQuestionsForMatch(match).map(publicQuestion);
    return NextResponse.json({
      matchId: match.id,
      stake: match.stake,
      secondsPerQuestion: config.SECONDS_PER_QUESTION,
      questions,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
