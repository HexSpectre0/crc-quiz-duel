// app/api/match/join/route.js
import { NextResponse } from 'next/server';
import { joinMatch, getQuestionsForMatch, publicQuestion, config } from '../../../../lib/game.js';
import { getMatch, saveMatch } from '../../../../lib/store.js';

export async function POST(req) {
  try {
    const { matchId, opponent } = await req.json();
    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const addr = (opponent || '').toLowerCase();
    const isCreator = match.creator && match.creator.toLowerCase() === addr;
    const isExistingOpponent = match.opponent && match.opponent.toLowerCase() === addr;
    const isExistingPlayer = match.players && match.players[addr];

    // If this address is ALREADY part of the match (creator, designated
    // opponent, or already joined), don't try to join again — just return the
    // questions so they can play. Only a brand-new second player calls joinMatch.
    if (!isCreator && !isExistingOpponent && !isExistingPlayer) {
      joinMatch(match, opponent); // throws if the match is already full with others
      await saveMatch(match);
    } else if (match.status === 'waiting' && isExistingOpponent) {
      // designated opponent arriving for the first time → activate
      match.status = 'active';
      await saveMatch(match);
    }

    const me = match.players[addr];
    const answeredCount = me ? me.answers.length : 0;
    const youFinished = me ? !!me.finished : false;

    const questions = getQuestionsForMatch(match).map(publicQuestion);
    return NextResponse.json({
      matchId: match.id,
      stake: match.stake,
      mode: match.mode,
      status: match.status,
      secondsPerQuestion: config.SECONDS_PER_QUESTION,
      questions,
      role: isCreator ? 'creator' : 'opponent',
      answeredCount,   // how many questions you've already answered
      youFinished,     // you've answered all your questions
      result: match.status === 'finished' ? match.result : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
