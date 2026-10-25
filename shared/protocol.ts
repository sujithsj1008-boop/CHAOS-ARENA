export const AVATARS = ["🦊", "🐸", "🐼", "🦄", "🐙", "🐯", "🐧", "🦖", "🐝", "🦝", "🐨", "🦉"] as const;
export type Avatar = (typeof AVATARS)[number];

export type PublicPlayer = {
  id: string;
  nickname: string;
  avatar: Avatar;
  connected: boolean;
  isHost: boolean;
};

export type GamePhase = "LOBBY" | "COUNTDOWN" | "ROUND_INTRO" | "ACTIVE_ROUND" | "ROUND_RESULTS" | "FINAL_RESULTS";
export type GameKind = "DRAW_GUESS" | "REFLEX_RUMBLE" | "BRAIN_GLITCH" | "CHAOS_FINALE";
export type AnswerResult = { playerId: string; answer?: string; correct: boolean; points: number; responseMs?: number; early?: boolean };
export type Point = { x: number; y: number };
export type DrawingStroke = { id: string; color: string; width: number; points: Point[] };
export type MatchSnapshot = {
  phase: GamePhase;
  stage: GameKind;
  round: number;
  totalRounds: number;
  artistId?: string;
  deadlineAt?: number;
  guessedPlayerIds: string[];
  drawing: DrawingStroke[];
  scores: Record<string, number>;
  revealedWord?: string;
  artistDisconnected?: boolean;
  signalVisible?: boolean;
  question?: { prompt: string; choices: string[]; number: number };
  correctAnswer?: string;
  explanation?: string;
  answers?: AnswerResult[];
  submittedPlayerIds?: string[];
};

export type RoomSnapshot = {
  code: string;
  players: PublicPlayer[];
  minPlayers: 2;
  maxPlayers: 12;
  phase: GamePhase;
  match?: MatchSnapshot;
};

export type RoomErrorCode = "INVALID_CODE" | "ROOM_FULL" | "NICKNAME_TAKEN" | "INVALID_NICKNAME" | "SESSION_INVALID" | "ROOM_EXPIRED" | "GAME_IN_PROGRESS" | "NOT_HOST" | "TOO_FEW_PLAYERS" | "INVALID_ACTION" | "RATE_LIMIT";
export type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: RoomErrorCode; message: string } };

export interface ClientToServerEvents {
  "room:create": (input: { nickname: string; avatar: Avatar }, ack: (result: Ack<JoinedRoom>) => void) => void;
  "room:join": (input: { code: string; nickname: string; avatar: Avatar }, ack: (result: Ack<JoinedRoom>) => void) => void;
  "room:reconnect": (input: { code: string; token: string }, ack: (result: Ack<JoinedRoom>) => void) => void;
  "room:leave": (ack?: (result: Ack<{ left: true }>) => void) => void;
  "game:start": (input: { turnsPerPlayer: 1 | 2; turnDuration: number }, ack: (result: Ack<{ started: true }>) => void) => void;
  "game:rematch": (ack: (result: Ack<{ started: true }>) => void) => void;
  "game:return-lobby": (ack: (result: Ack<{ returned: true }>) => void) => void;
  "draw:stroke": (input: { strokeId: string; color: string; width: number; points: Point[]; done: boolean }) => void;
  "draw:undo": () => void;
  "draw:clear": () => void;
  "guess:submit": (input: { text: string }, ack: (result: Ack<{ submitted: true }>) => void) => void;
  "reflex:press": (ack: (result: Ack<{ status: "early" | "scored"; reactionMs?: number }>) => void) => void;
  "quiz:submit": (input: { answer: string }, ack: (result: Ack<{ submitted: true }>) => void) => void;
  "finale:submit": (input: { answer: string }, ack: (result: Ack<{ submitted: true }>) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (snapshot: RoomSnapshot) => void;
  "room:error": (error: { code: RoomErrorCode; message: string }) => void;
  "round:private": (data: { role: "artist" | "guesser"; secretWord?: string }) => void;
  "draw:accepted": (input: { strokeId: string; color: string; width: number; points: Point[]; done: boolean }) => void;
  "draw:history": (history: DrawingStroke[]) => void;
  "guess:feedback": (data: { kind: "incorrect" | "correct"; message: string }) => void;
  "guess:correct": (data: { playerId: string; nickname: string; points: number; guessesRemaining: number }) => void;
  "reflex:signal": (data: { triggeredAt: number }) => void;
  "game:feedback": (data: { kind: "wrong" | "correct" | "early"; message: string }) => void;
}

export interface InterServerEvents {}
export interface SocketData { playerId?: string; roomCode?: string }
export type JoinedRoom = { room: RoomSnapshot; playerId: string; resumeToken: string };
