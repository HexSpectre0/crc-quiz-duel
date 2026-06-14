// app/api/match/create/route.js
import { NextResponse } from 'next/server';
import { newMatch, newPracticeMatch, getQuestionsForMatch, publicQuestion, config } from '../../../../lib/game.js';
import { saveMatch } from '../../../../lib/store.js';
import { randomUUID } from 'crypto';

export async function POST(req) {
  try {
    const { creator, stake, opponent, mode, practice } = await req.json();
    if (!creator || !stake) {
      return NextResponse.json({ error: 'creator and stake are required' }, { status: 400 });
    }
    const id = randomUUID().slice(0, 8);

    const match = practice
      ? newPracticeMatch({ id, creator, stake: Number(stake) })
      : newMatch({ id, creator, stake: Number(stake), opponent, mode });

    await saveMatch(match);

    const questions = getQuestionsForMatch(match).map(publicQuestion);
    return NextResponse.json({
      matchId: match.id,
      stake: match.stake,
      mode: match.mode,
      practice: Boolean(practice),
      secondsPerQuestion: config.SECONDS_PER_QUESTION,
      questions,
      shareUrl: `/duel/${match.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
