import { getStore } from "@netlify/blobs";
import { addPlayer, advance, AVATARS, beginMatch, cleanName, draw, finishTurn, guess, newRoom, publicRoom, randomCode, reflex, snapshot, submitAnswer, type Room } from "../game-state";

const rooms = getStore({ name: "chaos-arena-rooms", consistency: "strong" });
const alphabet = /^[A-HJ-NP-Z2-9]{6}$/;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const error = (message: string, code = "INVALID_ACTION", status = 400) => json({ ok: false, error: { code, message } }, status);
const validAvatar = (value: unknown): value is (typeof AVATARS)[number] => typeof value === "string" && (AVATARS as readonly string[]).includes(value);
const roomKey = (code: string) => `room-${code}`;

async function load(code: string) {
  const entry = await rooms.getWithMetadata(roomKey(code), { type: "json", consistency: "strong" });
  return entry ? { room: entry.data as Room, etag: entry.etag } : null;
}

async function writeNew(room: Room) {
  const result = await rooms.setJSON(roomKey(room.code), room, { onlyIfNew: true });
  if (result.modified && !result.etag) throw new Error("The room was not confirmed by Netlify Blobs. Please retry.");
  return result.modified;
}

async function updateRoom(code: string, change: (room: Room, now: number) => unknown | Promise<unknown>) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const stored = await load(code);
    if (!stored || !stored.etag) throw new Error("That room was not found.");
    const room = structuredClone(stored.room);
    const original = JSON.stringify(room);
    const now = Date.now();
    advance(room, now);
    const value = await change(room, now);
    if (JSON.stringify(room) === original) return { room, value };
    room.revision = (stored.room.revision ?? 0) + 1;
    room.updatedAt = now;
    const result = await rooms.setJSON(roomKey(code), room, { onlyIfMatch: stored.etag });
    // SDK 11.1.6 can return modified:true for provider errors; a missing ETag is not accepted as a successful save.
    if (result.modified && result.etag) return { room, value };
    if (result.modified && !result.etag) throw new Error("Netlify Blobs could not confirm the room update. Please retry.");
  }
  throw new Error("This room is receiving many actions at once. Please try again.");
}

function authorized(room: Room, token: unknown) {
  return typeof token === "string" && room.players.find(player => player.token === token);
}

function responseFor(room: Room, playerId: string, now = Date.now(), extra: Record<string, unknown> = {}) {
  const result = snapshot(room, playerId, now);
  return { ok: true, data: { ...result, revision: room.revision ?? 0, ...extra } };
}

export default async (request: Request) => {
  if (request.method !== "POST") return error("Use POST to interact with a room.", "METHOD_NOT_ALLOWED", 405);
  let input: Record<string, any>;
  try { input = await request.json(); } catch { return error("Request body must be valid JSON."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return error("Request body must be a JSON object.");
  const action = input.action;
  const now = Date.now();

  try {
    if (action === "room:create") {
      const nickname = cleanName(input.payload?.nickname ?? input.nickname);
      const avatar = input.payload?.avatar ?? input.avatar;
      if (!nickname || !validAvatar(avatar)) return error("Choose a nickname from 2 to 16 characters and a listed avatar.", "INVALID_NICKNAME");
      for (let i = 0; i < 8; i++) {
        const created = newRoom(randomCode(), nickname, avatar, now);
        if (await writeNew(created.room)) return json({ ok: true, data: { room: publicRoom(created.room, now), playerId: created.player.id, resumeToken: created.player.token } });
      }
      return error("Could not reserve a unique room code. Try again.", "ROOM_FULL", 503);
    }

    if (action === "room:join") {
      const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
      if (!alphabet.test(code)) return error("Enter a valid six-character room code.", "INVALID_CODE");
      const nickname = cleanName(input.payload?.nickname ?? input.nickname);
      const avatar = input.payload?.avatar ?? input.avatar;
      if (!nickname || !validAvatar(avatar)) return error("Choose a nickname from 2 to 16 characters and a listed avatar.", "INVALID_NICKNAME");
      const result = await updateRoom(code, (room, time) => {
        if (room.match) throw new Error("This match is already underway. Ask the host to invite you for the next game.");
        if (room.players.length >= 12) throw new Error("This room is full. There are only 12 player slots.");
        if (room.players.some(player => player.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase())) throw new Error("That nickname is already in this room. Pick another one.");
        return addPlayer(room, nickname, avatar, time);
      });
      return json(responseFor(result.room, (result.value as Room["players"][number]).id, Date.now(), { resumeToken: (result.value as Room["players"][number]).token }));
    }

    if (action === "room:reconnect") {
      const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
      if (!alphabet.test(code)) return error("This room has expired. Create a new room to play.", "ROOM_EXPIRED");
      const result = await updateRoom(code, room => {
        const player = authorized(room, input.token);
        if (!player) throw new Error("This reconnect link is no longer valid. Join the room again.");
        player.seenAt = Date.now();
        if (!room.players.some(other => other.isHost)) player.isHost = true;
        return player;
      });
      const player = result.value as Room["players"][number];
      return json(responseFor(result.room, player.id, Date.now(), { resumeToken: player.token }));
    }

    const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
    if (!alphabet.test(code)) return error("Enter a valid six-character room code.", "INVALID_CODE");
    const result = await updateRoom(code, (room, time) => {
      const player = authorized(room, input.token);
      if (!player) throw new Error("Your room session has expired. Rejoin the room.");
      if (time - player.seenAt >= 5_000) player.seenAt = time;
      const match = room.match;
      switch (action) {
        case "poll":
          break;
        case "room:leave": {
          room.players = room.players.filter(other => other.id !== player.id);
          if (room.match?.stage === "DRAW_GUESS" && room.match.artistOrder[room.match.turnIndex] === player.id && ["ROUND_INTRO", "ACTIVE_ROUND"].includes(room.match.phase)) finishTurn(room, time, true);
          if (player.isHost && room.players.length) room.players[0].isHost = true;
          break;
        }
        case "game:start":
        case "game:rematch": {
          if (!player.isHost) throw new Error("Only the host can start the match.");
          if (action === "game:start" && room.match) throw new Error("A match is already underway.");
          if (action === "game:rematch" && room.phase !== "FINAL_RESULTS") throw new Error("The current match has not finished.");
          const turns = input.payload?.turnsPerPlayer ?? match?.turnsPerPlayer ?? 1;
          const duration = input.payload?.turnDuration ?? match?.turnDuration ?? 60;
          if (![1, 2].includes(turns) || ![45, 60, 75].includes(duration)) throw new Error("Match settings are not valid.");
          beginMatch(room, turns, duration, time); break;
        }
        case "game:return-lobby":
          if (!player.isHost) throw new Error("Only the host can return to the lobby.");
          delete room.match; room.phase = "LOBBY"; break;
        case "draw:stroke":
          if (!match) throw new Error("There is no active match.");
          draw(room, player.id, { id: input.payload?.strokeId, color: input.payload?.color, width: input.payload?.width, points: input.payload?.points }); break;
        case "draw:undo":
          if (match?.stage !== "DRAW_GUESS" || match.phase !== "ACTIVE_ROUND" || match.artistOrder[match.turnIndex] !== player.id) throw new Error("Only the current artist can undo a stroke.");
          match.drawing.pop(); break;
        case "draw:clear":
          if (match?.stage !== "DRAW_GUESS" || match.phase !== "ACTIVE_ROUND" || match.artistOrder[match.turnIndex] !== player.id) throw new Error("Only the current artist can clear the canvas.");
          match.drawing = []; break;
        case "guess:submit": {
          if (!match) throw new Error("There is no active match.");
          const value = guess(room, player.id, input.payload?.text, time);
          return { ...value, feedback: value.correct ? `You got it! +${value.points} points` : "Not quite. Keep looking!" };
        }
        case "reflex:press":
          if (!match) throw new Error("There is no active match.");
          return reflex(room, player.id, time);
        case "quiz:submit":
        case "finale:submit":
          if (!match) throw new Error("There is no active match.");
          return submitAnswer(room, player.id, input.payload?.answer, time);
        default:
          throw new Error("That game action is not supported.");
      }
      return null;
    });
    return json(responseFor(result.room, result.room.players.find(p => p.token === input.token)?.id ?? "", Date.now(), result.value && typeof result.value === "object" ? result.value as Record<string, unknown> : {}));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The game request could not be completed.";
    const status = /not found|expired/i.test(message) ? 404 : /already underway|already|already locked|already guessed|only the host|Only the current|not valid|at least two|not available|no active|no open|not in/i.test(message) ? 409 : 400;
    return error(message, status === 404 ? "ROOM_EXPIRED" : "INVALID_ACTION", status);
  }
};
