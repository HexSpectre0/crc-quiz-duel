// src/game.js
// Game logic, ported for the browser (questions imported directly, no fs).
// Scoring and winner determination are pure functions so they can run either
// client-side (simple, no backend) or be moved server-side later for stronger
// anti-cheat. See README "Anti-cheat" for the tradeoff.

import questionsData from './questions.json';
import { QUESTIONS_PER_DUEL, SECONDS_PER_QUESTION } from './constants.js';

const ALL = questionsData.questions;

// Deterministic shuffle from a seed, so both players get the same set/order.
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

// Public version of a question: WITHOUT the answer (don't leak it to the UI
// before scoring; see anti-cheat note).
export function publicQuestion(q) {
  return { id: q.id, category: q.category, q: q.q, choices: q.choices };
}

export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

// Score a single answer. Returns points (0 if wrong/timeout).
// 100 base + up to 50 speed bonus.
export function scoreAnswer(question, choiceIndex, ms) {
  const timedOut = ms == null || ms > SECONDS_PER_QUESTION * 1000;
  const correct = !timedOut && choiceIndex === question.answerIndex;
  if (!correct) return { correct: false, points: 0 };
  const speedBonus = Math.max(0, Math.round(50 * (1 - ms / (SECONDS_PER_QUESTION * 1000))));
  return { correct: true, points: 100 + speedBonus };
}

// Given two finished players, decide winner. Tie broken by total time (faster wins).
export function decideWinner(playerA, playerB) {
  if (playerA.score === playerB.score) {
    const tA = playerA.answers.reduce((s, x) => s + (x.ms || 0), 0);
    const tB = playerB.answers.reduce((s, x) => s + (x.ms || 0), 0);
    return tA <= tB ? playerA : playerB;
  }
  return playerA.score > playerB.score ? playerA : playerB;
}

export const config = { QUESTIONS_PER_DUEL, SECONDS_PER_QUESTION };
export { ALL as allQuestions };
