// lib/game.js
// -----------------------------------------------------------------------------
// Toute la logique de jeu. POINT CLE ANTI-TRICHE :
//  - answerIndex (bonne reponse) ne quitte JAMAIS le serveur avant la fin.
//  - le scoring est calcule cote serveur a partir des reponses envoyees.
//  - les questions d'un duel sont figees a la creation (seed) pour que les
//    deux joueurs aient exactement le meme set, dans le meme ordre.
// -----------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

// Lecture du JSON via fs (cote serveur uniquement, dans les API routes).
// Evite les soucis d'import assertions selon la version de Node/Next.
const questionsData = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data', 'questions.json'), 'utf-8')
);

const ALL = questionsData.questions;
const QUESTIONS_PER_DUEL = 5;
const SECONDS_PER_QUESTION = 15;

// Melange deterministe a partir d'une seed (pour rejouer le meme set des 2 cotes)
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickQuestions(seed) {
  return seededShuffle(ALL, seed).slice(0, QUESTIONS_PER_DUEL);
}

// Version "publique" d'une question : SANS la bonne reponse.
export function publicQuestion(q) {
  return { id: q.id, category: q.category, q: q.q, choices: q.choices };
}

export function newMatch({ id, creator, stake, opponent = null, mode = 'friend' }) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const questions = pickQuestions(seed);
  return {
    id,
    seed,
    stake, // en CRC
    mode, // 'friend' | 'random'
    status: 'waiting', // waiting -> active -> finished
    createdAt: Date.now(),
    questionIds: questions.map((q) => q.id),
    players: {
      [creator.toLowerCase()]: emptyPlayer(creator),
      ...(opponent ? { [opponent.toLowerCase()]: emptyPlayer(opponent) } : {}),
    },
    creator: creator.toLowerCase(),
    opponent: opponent ? opponent.toLowerCase() : null,
    result: null, // { winner, loser, settled }
  };
}

function emptyPlayer(address) {
  return {
    address: address.toLowerCase(),
    answers: [], // [{ qIndex, choiceIndex, correct, ms }]
    score: 0,
    finished: false,
  };
}

export function getQuestionsForMatch(match) {
  // reconstruit les objets complets a partir des ids figes
  return match.questionIds.map((id) => ALL.find((q) => q.id === id));
}

export function joinMatch(match, opponent) {
  const a = opponent.toLowerCase();
  if (match.opponent && match.opponent !== a) {
    throw new Error('Match already has an opponent.');
  }
  if (!match.players[a]) match.players[a] = emptyPlayer(a);
  match.opponent = a;
  match.status = 'active';
  return match;
}

// Enregistre une reponse, corrige cote serveur, met a jour le score.
export function submitAnswer(match, address, qIndex, choiceIndex, ms) {
  const a = address.toLowerCase();
  const player = match.players[a];
  if (!player) throw new Error('Player not in this match.');
  if (player.finished) throw new Error('Player already finished.');
  if (player.answers.find((x) => x.qIndex === qIndex)) {
    throw new Error('Question already answered.'); // anti-rejeu
  }

  const questions = getQuestionsForMatch(match);
  const q = questions[qIndex];
  if (!q) throw new Error('Invalid question index.');

  const timedOut = ms == null || ms > SECONDS_PER_QUESTION * 1000;
  const correct = !timedOut && choiceIndex === q.answerIndex;

  // Scoring : 100 pts par bonne reponse + bonus rapidite (jusqu'a 50).
  let points = 0;
  if (correct) {
    points = 100;
    const speedBonus = Math.max(0, Math.round(50 * (1 - ms / (SECONDS_PER_QUESTION * 1000))));
    points += speedBonus;
  }
  player.answers.push({ qIndex, choiceIndex, correct, ms: ms ?? null, points });
  player.score += points;

  if (player.answers.length >= match.questionIds.length) {
    player.finished = true;
  }

  maybeFinish(match);
  return { correct, points, finished: player.finished };
}

function maybeFinish(match) {
  const players = Object.values(match.players);
  const both = players.length === 2 && players.every((p) => p.finished);
  if (!both) return;

  const [p1, p2] = players;
  let winner, loser;
  if (p1.score === p2.score) {
    // egalite : depart au temps total cumule (plus rapide gagne)
    const t1 = p1.answers.reduce((s, x) => s + (x.ms || 0), 0);
    const t2 = p2.answers.reduce((s, x) => s + (x.ms || 0), 0);
    [winner, loser] = t1 <= t2 ? [p1, p2] : [p2, p1];
  } else {
    [winner, loser] = p1.score > p2.score ? [p1, p2] : [p2, p1];
  }
  match.status = 'finished';
  match.result = { winner: winner.address, loser: loser.address, settled: false };
}

export const config = { QUESTIONS_PER_DUEL, SECONDS_PER_QUESTION };
