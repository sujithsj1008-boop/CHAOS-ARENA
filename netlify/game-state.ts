import { randomBytes, randomUUID } from "node:crypto";
import { AVATARS, type Avatar, type DrawingStroke, type GameKind, type GamePhase, type MatchSnapshot, type PublicPlayer, type RoomSnapshot } from "../shared/protocol";

export type Player = { id: string; nickname: string; avatar: Avatar; token: string; seenAt: number; isHost: boolean };
export type Question = { prompt: string; choices: string[]; answer: string; explanation: string };
export type Answer = { playerId: string; answer?: string; correct: boolean; points: number; responseMs?: number; early?: boolean };
export type Match = {
  phase: Exclude<GamePhase, "LOBBY">; stage: GameKind; round: number; totalRounds: number; turnsPerPlayer: 1 | 2; turnDuration: number;
  participantIds: string[]; artistOrder: string[]; turnIndex: number; secretWord?: string; guessed: string[]; drawing: DrawingStroke[];
  scores: Record<string, number>; deadlineAt: number; activeStartedAt?: number; artistDisconnected?: boolean;
  submitted: string[]; answers: Answer[]; question?: Question; questionIndex: number; usedQuestions: number[];
  signalVisible: boolean; signalAt?: number; clearAt?: number; usedWords: string[]; guessTimes: { playerId: string; at: number }[];
};
export type Room = { code: string; players: Player[]; phase: GamePhase; match?: Match; updatedAt: number; revision: number };

export const WORDS = ["penguin", "pineapple", "spaceship", "taco", "octopus", "roller skate", "volcano", "sunglasses", "popcorn", "giraffe", "umbrella", "birthday cake", "toothbrush", "campfire", "snowman", "teapot", "helicopter", "watermelon", "backpack", "mermaid", "skateboard", "pancakes", "dragon", "mailbox", "hot dog", "cactus", "treasure chest", "rubber duck", "moon landing", "jellyfish", "trophy", "washing machine", "ice cream", "robot", "treehouse", "pizza", "rainbow", "dinosaur", "lighthouse", "sleepwalking", "spaghetti", "parachute", "beach ball", "kangaroo", "frying pan", "fireworks", "snail", "crown", "windmill", "bubble bath", "pirate ship", "ballet", "sneeze", "camping", "magic trick", "banana peel", "alarm clock", "hula hoop", "roller coaster", "sushi", "squirrel"];
export const QUESTIONS: Question[] = [
  { prompt: "What is 9 × 7?", choices: ["56", "63", "72", "79"], answer: "63", explanation: "Nine groups of seven make sixty-three." },
  { prompt: "A shape has three sides. What is it?", choices: ["Triangle", "Square", "Pentagon", "Circle"], answer: "Triangle", explanation: "A triangle has exactly three sides." },
  { prompt: "What comes next: 2, 4, 8, 16, ...?", choices: ["20", "24", "30", "32"], answer: "32", explanation: "Each number doubles." },
  { prompt: "Which is the largest planet in our solar system?", choices: ["Earth", "Saturn", "Jupiter", "Neptune"], answer: "Jupiter", explanation: "Jupiter is the largest planet in our solar system." },
  { prompt: "A dozen eggs minus four eggs leaves how many?", choices: ["6", "8", "10", "12"], answer: "8", explanation: "A dozen is twelve; twelve minus four is eight." },
  { prompt: "Which animal is a mammal?", choices: ["Shark", "Dolphin", "Trout", "Octopus"], answer: "Dolphin", explanation: "Dolphins breathe air and nurse their young." },
  { prompt: "What is half of 90?", choices: ["35", "40", "45", "50"], answer: "45", explanation: "Ninety split into two equal parts is forty-five." },
  { prompt: "Which direction is opposite to north?", choices: ["East", "South", "West", "Up"], answer: "South", explanation: "South is opposite north on a compass." },
  { prompt: "How many minutes are in two hours?", choices: ["100", "110", "120", "200"], answer: "120", explanation: "Two hours have one hundred twenty minutes." },
  { prompt: "Which one is not a primary rainbow color?", choices: ["Red", "Green", "Blue", "Purple"], answer: "Purple", explanation: "Purple is a mix at the violet end." },
  { prompt: "A farmer has 5 hens. Each lays 2 eggs. How many eggs?", choices: ["7", "10", "12", "15"], answer: "10", explanation: "Five hens laying two each gives ten eggs." },
  { prompt: "What is the opposite of 'ancient'?", choices: ["Old", "Modern", "Historic", "Early"], answer: "Modern", explanation: "Modern means current or recent, unlike ancient." },
  { prompt: "Which number is even?", choices: ["13", "21", "38", "45"], answer: "38", explanation: "Thirty-eight divides evenly by two." },
  { prompt: "What do bees collect from flowers to make honey?", choices: ["Nectar", "Pebbles", "Leaves", "Dew"], answer: "Nectar", explanation: "Bees turn flower nectar into honey." },
  { prompt: "If today is Monday, what day is three days later?", choices: ["Tuesday", "Wednesday", "Thursday", "Friday"], answer: "Thursday", explanation: "Tuesday, Wednesday, then Thursday." },
  { prompt: "Which is the smallest: 0.2, 0.12, 0.5, 0.25?", choices: ["0.2", "0.12", "0.5", "0.25"], answer: "0.12", explanation: "Twelve hundredths is smallest." },
  { prompt: "How many legs do two spiders have altogether?", choices: ["8", "12", "16", "20"], answer: "16", explanation: "A spider has eight legs; two have sixteen." },
  { prompt: "Which material is attracted to a magnet?", choices: ["Wood", "Iron", "Glass", "Paper"], answer: "Iron", explanation: "Iron is magnetic." },
  { prompt: "What is 100 divided by 4?", choices: ["20", "25", "40", "50"], answer: "25", explanation: "Four groups of twenty-five make one hundred." },
  { prompt: "Which word is spelled correctly?", choices: ["Definately", "Definitely", "Definitly", "Definetely"], answer: "Definitely", explanation: "Definitely is spelled d-e-f-i-n-i-t-e-l-y." },
];
export const FINALE: Question[] = [
  { prompt: "What comes next: 3, 6, 11, 18, 27, ...?", choices: ["36", "38", "40", "42"], answer: "38", explanation: "The gaps are 3, 5, 7, 9; next add 11." },
  { prompt: "A clock shows 3:15. What is the smaller angle between its hands?", choices: ["0°", "7.5°", "15°", "22.5°"], answer: "7.5°", explanation: "The minute hand is at 90°, the hour hand 7.5° past it." },
  { prompt: "A bat and ball cost $1.10 total. The bat costs $1 more. How much is the ball?", choices: ["5¢", "10¢", "15¢", "20¢"], answer: "5¢", explanation: "A $1.05 bat and 5¢ ball total $1.10." },
];
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const randomCode = () => Array.from(randomBytes(6), byte => alphabet[byte % alphabet.length]).join("");
export const token = () => randomBytes(32).toString("base64url");
export const cleanName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const result = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return result.length >= 2 && result.length <= 16 ? result : null;
};
export const normalize = (text: string) => text.normalize("NFKD").toLocaleLowerCase("en-US").replace(/\p{M}/gu, "").replace(/[^a-z0-9. ]/g, "").trim().replace(/\s+/g, " ");
const sample = <T,>(list: T[]) => list[randomBytes(4).readUInt32BE() % list.length];
const online = (room: Room, now: number) => room.players.filter(player => now - player.seenAt < 20_000);

function startArtist(room: Room, now: number) {
  const match = room.match!;
  if (match.round >= match.totalRounds) return beginReflex(room, now);
  match.stage = "DRAW_GUESS"; match.round += 1; match.turnIndex = match.round - 1;
  const artistId = match.artistOrder[match.turnIndex];
  match.secretWord = sample(WORDS.filter(word => !match.usedWords.includes(word)));
  match.usedWords.push(match.secretWord); match.guessed = []; match.drawing = []; match.answers = []; match.submitted = [];
  match.phase = "ROUND_INTRO"; match.deadlineAt = now + 2_500; room.phase = match.phase;
  if (!room.players.some(player => player.id === artistId && now - player.seenAt < 20_000)) finishTurn(room, now, true);
}
function beginReflex(room: Room, now: number) {
  const match = room.match!; match.stage = "REFLEX_RUMBLE"; match.round = 1; match.totalRounds = 1; match.phase = "ROUND_INTRO";
  match.answers = []; match.submitted = []; match.signalVisible = false; match.signalAt = now + 4_800 + randomBytes(2).readUInt16BE() % 2_500;
  match.deadlineAt = now + 3_000; room.phase = match.phase;
}
function beginQuestion(room: Room, now: number, index: number) {
  const match = room.match!; match.stage = "BRAIN_GLITCH"; match.round = index + 1; match.totalRounds = 5;
  const available = QUESTIONS.filter((_, i) => !match.usedQuestions.includes(i));
  const question = sample(available); match.question = question; match.questionIndex = QUESTIONS.indexOf(question); match.usedQuestions.push(match.questionIndex);
  match.answers = []; match.submitted = []; match.phase = "ROUND_INTRO"; match.deadlineAt = now + 2_200; room.phase = match.phase;
}
function beginFinale(room: Room, now: number) {
  const match = room.match!; match.stage = "CHAOS_FINALE"; match.round = 1; match.totalRounds = 1; match.question = sample(FINALE);
  match.answers = []; match.submitted = []; match.phase = "ROUND_INTRO"; match.deadlineAt = now + 2_500; room.phase = match.phase;
}
export function finishTurn(room: Room, now: number, disconnected = false) {
  const match = room.match!; match.phase = "ROUND_RESULTS"; match.artistDisconnected = disconnected; match.clearAt = now + 4_500; match.deadlineAt = match.clearAt; room.phase = match.phase;
}
function finishMini(room: Room, now: number) { const match = room.match!; match.phase = "ROUND_RESULTS"; match.clearAt = now + 4_500; match.deadlineAt = match.clearAt; room.phase = match.phase; }
export function advance(room: Room, now: number) {
  const match = room.match; if (!match) return false;
  const before = `${match.phase}:${match.stage}:${match.round}:${match.signalVisible}`;
  if (match.stage === "DRAW_GUESS" && match.phase === "ACTIVE_ROUND" && !room.players.some(player => player.id === match.artistOrder[match.turnIndex] && now - player.seenAt < 20_000)) finishTurn(room, now, true);
  if (match.stage === "REFLEX_RUMBLE" && match.phase === "ACTIVE_ROUND" && !match.signalVisible && now >= (match.signalAt ?? Infinity)) match.signalVisible = true;
  if (now >= match.deadlineAt) {
    if (match.phase === "COUNTDOWN") startArtist(room, now);
    else if (match.phase === "ROUND_INTRO") {
      if (match.stage === "DRAW_GUESS" && !room.players.some(player => player.id === match.artistOrder[match.turnIndex] && now - player.seenAt < 20_000)) finishTurn(room, now, true);
      else { match.phase = "ACTIVE_ROUND"; match.activeStartedAt = now; room.phase = match.phase; if (match.stage === "REFLEX_RUMBLE") match.deadlineAt = (match.signalAt ?? now) + 10_000; else match.deadlineAt = now + (match.stage === "DRAW_GUESS" ? match.turnDuration * 1000 : match.stage === "CHAOS_FINALE" ? 20_000 : 15_000); }
    } else if (match.phase === "ACTIVE_ROUND") {
      if (match.stage === "DRAW_GUESS") finishTurn(room, now);
      else finishMini(room, now);
    } else if (match.phase === "ROUND_RESULTS" && now >= (match.clearAt ?? Infinity)) {
      if (match.stage === "DRAW_GUESS") startArtist(room, now);
      else if (match.stage === "REFLEX_RUMBLE") beginQuestion(room, now, 0);
      else if (match.stage === "BRAIN_GLITCH") match.round < 5 ? beginQuestion(room, now, match.round) : beginFinale(room, now);
      else { match.phase = "FINAL_RESULTS"; room.phase = match.phase; match.clearAt = undefined; }
    }
  }
  return before !== `${match.phase}:${match.stage}:${match.round}:${match.signalVisible}`;
}
export function publicRoom(room: Room, now: number): RoomSnapshot {
  const players: PublicPlayer[] = room.players.map(({ id, nickname, avatar, seenAt, isHost }) => ({ id, nickname, avatar, isHost, connected: now - seenAt < 20_000 }));
  const match = room.match;
  if (!match) return { code: room.code, players, minPlayers: 2, maxPlayers: 12, phase: "LOBBY" };
  const reveal = match.phase === "ROUND_RESULTS" || match.phase === "FINAL_RESULTS";
  const snapshot: MatchSnapshot = {
    phase: match.phase, stage: match.stage, round: match.round, totalRounds: match.totalRounds,
    ...(match.stage === "DRAW_GUESS" ? { artistId: match.artistOrder[match.turnIndex] } : {}), deadlineAt: match.deadlineAt,
    guessedPlayerIds: match.guessed, drawing: match.drawing, scores: match.scores,
    ...(match.stage === "DRAW_GUESS" && reveal ? { revealedWord: match.secretWord, artistDisconnected: match.artistDisconnected } : {}),
    ...(match.stage === "REFLEX_RUMBLE" ? { signalVisible: match.signalVisible } : {}),
    ...(match.question ? { question: { prompt: match.question.prompt, choices: match.question.choices, number: match.round } } : {}),
    ...(reveal && match.question ? { correctAnswer: match.question.answer, explanation: match.question.explanation } : {}),
    ...(reveal && match.answers.length ? { answers: match.answers.map(({ answer: _answer, ...answer }) => answer) } : {}),
    ...(match.submitted.length ? { submittedPlayerIds: match.submitted } : {}),
  };
  return { code: room.code, players, minPlayers: 2, maxPlayers: 12, phase: match.phase, match: snapshot };
}
export function answerPrivateWord(room: Room, playerId: string) { const match = room.match; return match?.stage === "DRAW_GUESS" && match.artistOrder[match.turnIndex] === playerId && ["ROUND_INTRO", "ACTIVE_ROUND"].includes(match.phase) ? match.secretWord : undefined; }
export function newRoom(code: string, nickname: string, avatar: Avatar, now: number) {
  const player: Player = { id: randomUUID(), nickname, avatar, token: token(), seenAt: now, isHost: true };
  return { room: { code, players: [player], phase: "LOBBY" as GamePhase, updatedAt: now, revision: 0 }, player };
}
export function addPlayer(room: Room, nickname: string, avatar: Avatar, now: number) {
  const player: Player = { id: randomUUID(), nickname, avatar, token: token(), seenAt: now, isHost: false };
  room.players.push(player); room.updatedAt = now; return player;
}
export function beginMatch(room: Room, turnsPerPlayer: 1 | 2, turnDuration: number, now: number) {
  const players = online(room, now); if (players.length < 2) throw new Error("At least two connected players are needed to start.");
  const shuffled = [...players].sort(() => randomBytes(1)[0] % 2 ? 1 : -1).map(p => p.id);
  const artistOrder = Array.from({ length: turnsPerPlayer }, () => [...shuffled].sort(() => randomBytes(1)[0] % 2 ? 1 : -1)).flat();
  const scores = Object.fromEntries(players.map(p => [p.id, 0]));
  const match: Match = { phase: "COUNTDOWN", stage: "DRAW_GUESS", round: 0, totalRounds: players.length * turnsPerPlayer, turnsPerPlayer, turnDuration, participantIds: players.map(p => p.id), artistOrder, turnIndex: -1, guessed: [], drawing: [], scores, deadlineAt: now + 3_000, submitted: [], answers: [], questionIndex: 0, usedQuestions: [], signalVisible: false, usedWords: [], guessTimes: [] };
  room.match = match; room.phase = match.phase; room.updatedAt = now;
}
export function guess(room: Room, playerId: string, text: string, now: number) {
  const match = room.match!; if (match.stage !== "DRAW_GUESS" || match.phase !== "ACTIVE_ROUND" || match.artistOrder[match.turnIndex] === playerId) throw new Error("There is no active guess right now.");
  if (match.guessed.includes(playerId)) throw new Error("You already guessed this word."); if (typeof text !== "string" || text.length > 64) throw new Error("Keep guesses under 64 characters.");
  match.guessTimes = match.guessTimes.filter(attempt => now - attempt.at < 1_000);
  if (match.guessTimes.filter(attempt => attempt.playerId === playerId).length >= 5) throw new Error("Slow down a little before guessing again.");
  match.guessTimes.push({ playerId, at: now });
  if (normalize(text) !== normalize(match.secretWord ?? "")) return { correct: false, points: 0 };
  const points = Math.max(100, 500 - match.guessed.length * 100); match.guessed.push(playerId); match.scores[playerId] += points; match.scores[match.artistOrder[match.turnIndex]] += 200;
  if (online(room, now).filter(p => p.id !== match.artistOrder[match.turnIndex]).every(p => match.guessed.includes(p.id))) finishTurn(room, now);
  return { correct: true, points, playerId };
}
export function draw(room: Room, playerId: string, stroke: DrawingStroke) {
  const match = room.match!; if (match.stage !== "DRAW_GUESS" || match.phase !== "ACTIVE_ROUND" || match.artistOrder[match.turnIndex] !== playerId) throw new Error("Only the current artist can draw.");
  if (!stroke || typeof stroke.id !== "string" || stroke.id.length > 40 || !/^#[\da-f]{6}$/i.test(stroke.color) || ![3, 7, 12, 20].includes(stroke.width) || !Array.isArray(stroke.points) || stroke.points.length < 1 || stroke.points.length > 40 || !stroke.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) throw new Error("Drawing data is invalid.");
  if (match.drawing.reduce((n, s) => n + s.points.length, 0) + stroke.points.length > 1800) throw new Error("The canvas reached its drawing limit.");
  const current = match.drawing.find(s => s.id === stroke.id);
  if (current) current.points.push(...stroke.points.map(p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })));
  else { if (match.drawing.length >= 100) throw new Error("The canvas reached its drawing limit."); match.drawing.push(structuredClone(stroke)); }
}
export function reflex(room: Room, playerId: string, now: number) {
  const match = room.match!; if (match.stage !== "REFLEX_RUMBLE" || match.phase !== "ACTIVE_ROUND" || match.submitted.includes(playerId)) throw new Error("Your reflex response is not available.");
  match.submitted.push(playerId); const early = !match.signalVisible || now < (match.signalAt ?? Infinity);
  let points = 0; let responseMs: number | undefined;
  if (early) match.answers.push({ playerId, correct: false, points: 0, early: true });
  else { responseMs = now - (match.signalAt ?? now); const count = match.answers.filter(a => !a.early).length; points = [500, 350, 250, 150, 100][count] ?? 0; match.answers.push({ playerId, correct: true, points, responseMs }); match.scores[playerId] += points; }
  if (online(room, now).every(p => match.submitted.includes(p.id))) finishMini(room, now);
  return { early, points, responseMs, feedback: early ? "Too soon! Wait for the cyan signal." : `Nice reflexes · ${responseMs} ms · +${points}` };
}
export function submitAnswer(room: Room, playerId: string, answer: string, now: number) {
  const match = room.match!; if (!["BRAIN_GLITCH", "CHAOS_FINALE"].includes(match.stage) || match.phase !== "ACTIVE_ROUND" || match.submitted.includes(playerId)) throw new Error("There is no open answer round.");
  if (typeof answer !== "string" || answer.length > 64 || !match.question) throw new Error("Answer must be 64 characters or fewer.");
  match.submitted.push(playerId); const correct = normalize(answer) === normalize(match.question.answer);
  const duration = match.stage === "CHAOS_FINALE" ? 20_000 : 15_000; const base = match.stage === "CHAOS_FINALE" ? 600 : 300;
  const points = correct ? base + Math.round(200 * Math.max(0, match.deadlineAt - now) / duration) : 0;
  match.answers.push({ playerId, answer, correct, points, responseMs: now - (match.activeStartedAt ?? now) }); if (correct) match.scores[playerId] += points;
  if (online(room, now).every(p => match.submitted.includes(p.id))) finishMini(room, now);
  return { correct, points, feedback: correct ? `Correct · +${points} points` : "Not quite. Your answer is locked in." };
}
export function snapshot(room: Room, playerId: string, now: number) { const view = publicRoom(room, now); return { room: view, playerId, privateWord: answerPrivateWord(room, playerId) }; }
export function newPlayerId() { return randomUUID(); }
export { AVATARS };
