import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({ entries: new Map<string, { value: unknown; etag: string }>(), sequence: 0 }));
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    getWithMetadata: async (key: string, options: { consistency?: string }) => {
      if (options.consistency !== "strong") throw new Error("Function must read with strong consistency");
      const entry = memory.entries.get(key);
      return entry ? { data: structuredClone(entry.value), etag: entry.etag, metadata: {} } : null;
    },
    setJSON: async (key: string, value: unknown, options: { onlyIfNew?: boolean; onlyIfMatch?: string }) => {
      await Promise.resolve();
      const current = memory.entries.get(key);
      if (options.onlyIfNew && current) return { modified: false };
      if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false };
      const etag = `"${++memory.sequence}"`;
      memory.entries.set(key, { value: structuredClone(value), etag });
      return { modified: true, etag };
    },
  }),
}));

const { default: game } = await import("../netlify/functions/game");
let now = 1_800_000_000_000;
type ApiResult = { ok: boolean; data?: any; error?: { message: string; code: string } };

async function call(body: Record<string, unknown>): Promise<ApiResult> {
  vi.setSystemTime(now);
  const response = await game(new Request("https://example.net/.netlify/functions/game", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return response.json() as Promise<ApiResult>;
}
function action(action: string, code: string, token: string, payload?: unknown) { return call({ action, code, token, payload }); }
function success(result: ApiResult) { expect(result.ok, result.error?.message).toBe(true); return result.data!; }
function getRoom(code: string) { return memory.entries.get(`room-${code}`)!.value as any; }

beforeEach(() => {
  memory.entries.clear(); memory.sequence = 0; now = 1_800_000_000_000;
  vi.useFakeTimers(); vi.setSystemTime(now);
});

describe("Netlify request-response multiplayer game", () => {
  it("runs two independent players through all four stages and protects room secrets", async () => {
    const host = success(await call({ action: "room:create", payload: { nickname: "Artist", avatar: "🦊" } }));
    const roomCode = host.room.code as string;
    const guest = success(await call({ action: "room:join", code: roomCode, payload: { nickname: "Guesser", avatar: "🐸" } }));
    const hostToken = host.resumeToken as string;
    const guestToken = guest.resumeToken as string;
    expect(guest.room.players).toHaveLength(2);

    const otherRoom = success(await call({ action: "room:create", payload: { nickname: "Other", avatar: "🐼" } }));
    const crossRoom = await action("poll", otherRoom.room.code, hostToken);
    expect(crossRoom.ok).toBe(false);
    expect(JSON.stringify(crossRoom)).not.toContain(roomCode);

    success(await action("game:start", roomCode, hostToken, { turnsPerPlayer: 1, turnDuration: 45 }));
    now += 3_000;
    let state = success(await action("poll", roomCode, hostToken)).room;
    expect(state.phase).toBe("ROUND_INTRO");
    now += 2_500;
    state = success(await action("poll", roomCode, hostToken)).room;
    expect(state.phase, JSON.stringify(getRoom(roomCode).match)).toBe("ACTIVE_ROUND");

    const firstArtist = state.match.artistId;
    const firstArtistToken = firstArtist === host.playerId ? hostToken : guestToken;
    const firstGuesserToken = firstArtist === host.playerId ? guestToken : hostToken;
    const privatePrompt = success(await action("poll", roomCode, firstArtistToken));
    const secretWord = privatePrompt.privateWord as string;
    const guesserView = success(await action("poll", roomCode, firstGuesserToken));
    expect(secretWord).toBeTruthy();
    expect(guesserView.privateWord).toBeUndefined();
    expect(JSON.stringify(guesserView)).not.toContain(secretWord);
    const drawing = success(await action("draw:stroke", roomCode, firstArtistToken, { strokeId: "stroke-1", color: "#ff5977", width: 7, points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }], done: true }));
    expect(drawing.room.match.drawing[0].points).toHaveLength(2);
    expect(success(await action("poll", roomCode, firstGuesserToken)).room.match.drawing[0].id).toBe("stroke-1");
    let guessed = success(await action("guess:submit", roomCode, firstGuesserToken, { text: secretWord }));
    expect(guessed.room.match.phase).toBe("ROUND_RESULTS");
    expect(guessed.room.match.revealedWord).toBe(secretWord);
    expect(guessed.room.match.scores[guessed.playerId]).toBe(500);
    expect(guessed.room.match.scores[firstArtist]).toBe(200);

    now += 4_500; success(await action("poll", roomCode, hostToken));
    now += 2_500; state = success(await action("poll", roomCode, guestToken)).room;
    const secondArtist = state.match.artistId;
    const secondArtistToken = secondArtist === host.playerId ? hostToken : guestToken;
    const secondGuesserToken = secondArtist === host.playerId ? guestToken : hostToken;
    const secondSecret = success(await action("poll", roomCode, secondArtistToken)).privateWord as string;
    now += 2_500; state = success(await action("poll", roomCode, hostToken)).room;
    expect(state.phase, JSON.stringify(getRoom(roomCode).match)).toBe("ACTIVE_ROUND");
    const secretAtSecondStart = success(await action("poll", roomCode, secondArtistToken)).privateWord as string;
    guessed = success(await action("guess:submit", roomCode, secondGuesserToken, { text: secretAtSecondStart || secondSecret }));
    expect(guessed.room.match.phase).toBe("ROUND_RESULTS");

    now += 4_500; state = success(await action("poll", roomCode, guestToken)).room;
    expect(state.match.stage).toBe("REFLEX_RUMBLE");
    now += 3_000; state = success(await action("poll", roomCode, hostToken)).room;
    expect(state.phase).toBe("ACTIVE_ROUND");
    const storedReflex = getRoom(roomCode).match;
    now = storedReflex.signalAt + 5;
    state = success(await action("poll", roomCode, hostToken)).room;
    expect(state.match.signalVisible).toBe(true);
    const [hostReflex, guestReflex] = await Promise.all([
      action("reflex:press", roomCode, hostToken), action("reflex:press", roomCode, guestToken),
    ]);
    expect(hostReflex.ok && guestReflex.ok).toBe(true);
    expect(success(await action("poll", roomCode, guestToken)).room.match.phase).toBe("ROUND_RESULTS");

    now += 4_500; state = success(await action("poll", roomCode, hostToken)).room;
    expect(state.match.stage).toBe("BRAIN_GLITCH");
    for (let question = 1; question <= 5; question++) {
      if (question > 1) { now += 4_500; state = success(await action("poll", roomCode, hostToken)).room; expect(state.phase).toBe("ROUND_INTRO"); }
      now += 2_200; state = success(await action("poll", roomCode, guestToken)).room;
      expect(state.phase).toBe("ACTIVE_ROUND");
      expect(state.match.correctAnswer).toBeUndefined();
      expect(state.match.question.answer).toBeUndefined();
      const answer = getRoom(roomCode).match.question.answer as string;
      const [hostAnswer, guestAnswer] = await Promise.all([
        action("quiz:submit", roomCode, hostToken, { answer }), action("quiz:submit", roomCode, guestToken, { answer }),
      ]);
      expect(hostAnswer.ok && guestAnswer.ok).toBe(true);
      const result = success(await action("poll", roomCode, hostToken)).room;
      expect(result.phase).toBe("ROUND_RESULTS");
      expect(result.match.correctAnswer).toBe(answer);
      expect(result.match.scores[host.playerId]).toBeGreaterThan(0);
      expect(result.match.scores[guest.playerId]).toBeGreaterThan(0);
    }

    now += 4_500; state = success(await action("poll", roomCode, guestToken)).room;
    expect(state.match.stage).toBe("CHAOS_FINALE");
    now += 2_500; state = success(await action("poll", roomCode, hostToken)).room;
    expect(state.phase).toBe("ACTIVE_ROUND");
    const finaleAnswer = getRoom(roomCode).match.question.answer as string;
    const [hostFinale, guestFinale] = await Promise.all([
      action("finale:submit", roomCode, hostToken, { answer: finaleAnswer }),
      action("finale:submit", roomCode, guestToken, { answer: finaleAnswer }),
    ]);
    expect(hostFinale.ok && guestFinale.ok).toBe(true);
    now += 4_500;
    const final = success(await action("poll", roomCode, hostToken)).room;
    expect(final.phase).toBe("FINAL_RESULTS");
    expect(final.match.stage).toBe("CHAOS_FINALE");
    expect(Math.max(...Object.values(final.match.scores))).toBeGreaterThan(0);
  });

  it("serializes simultaneous correct answers without losing either score", async () => {
    const host = success(await call({ action: "room:create", payload: { nickname: "Host", avatar: "🦊" } }));
    const roomCode = host.room.code as string;
    const guest = success(await call({ action: "room:join", code: roomCode, payload: { nickname: "Guest", avatar: "🐸" } }));
    success(await action("game:start", roomCode, host.resumeToken, { turnsPerPlayer: 1, turnDuration: 45 }));
    now += 3_000; success(await action("poll", roomCode, host.resumeToken));
    now += 2_500; success(await action("poll", roomCode, guest.resumeToken));
    const artist = getRoom(roomCode).match.artistOrder[0];
    const tokens = [host, guest];
    const artistToken = tokens.find((player: any) => player.playerId === artist)!.resumeToken;
    const guesserToken = tokens.find((player: any) => player.playerId !== artist)!.resumeToken;
    const secret = success(await action("poll", roomCode, artistToken)).privateWord;
    const [first, duplicate] = await Promise.all([
      action("guess:submit", roomCode, guesserToken, { text: secret }),
      action("guess:submit", roomCode, guesserToken, { text: secret }),
    ]);
    expect([first.ok, duplicate.ok].filter(Boolean)).toHaveLength(1);
    const stored = getRoom(roomCode);
    expect(stored.match.scores[artist]).toBe(200);
    expect(stored.match.scores[stored.match.participantIds.find((id: string) => id !== artist)]).toBe(500);
  });
});
