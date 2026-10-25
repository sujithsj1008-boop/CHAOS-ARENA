# Netlify architecture notes

## Runtime

- Frontend: React 19, TypeScript, and Vite.
- Multiplayer endpoint: `netlify/functions/game.ts`, exposed at Netlify's default `/.netlify/functions/game` path. It accepts JSON `POST` requests; there is no `config.path` or custom `/api/game` route.
- State store: `@netlify/blobs` 11.1.6, one site-wide `chaos-arena-rooms` entry per room.
- Browser communication: request/response actions plus a 1.5-second polling loop. Drawing batches are coalesced and sent as ordinary requests. All four existing match stages remain server-authoritative.
- Build: `pnpm build`; Netlify's `esbuild` Function bundler packages the TypeScript Function and helper at `netlify/game-state.ts`.

## Blobs semantics and concurrency

The project uses the installed SDK's `getStore({ name, consistency: "strong" })`, strongly consistent `getWithMetadata`, `setJSON({ onlyIfNew: true })` for room creation, and `setJSON({ onlyIfMatch: etag })` for room updates. The ETag is the room revision boundary: an action reloads current state and revalidates its player/session, phase, and score effects when a concurrent write wins. A stale write retries up to 12 times; it never replaces a newer room snapshot.

The installed SDK version is 11.1.6. Its conditional-write implementation can report `modified: true` for non-412 provider failures. The Function therefore also requires a returned ETag before treating a conditional write as confirmed; a missing ETag is reported as a storage failure.

Strong consistency and the ETag comparison protect single-room updates. Blobs are not a relational database, so this project avoids multiple-key transactions. A room's full mutable state stays under one key. The app has a local fake-store concurrency test; production Blobs behavior still needs live deployment verification.

## Identity, privacy, and gameplay

- A player receives a random ID and high-entropy resume token on create/join. Every later action is looked up by the token stored in the room. Player IDs, scores, correctness, timestamps, and room records are never trusted from a request body.
- The secret drawing word is stored in the private room Blob. Only the authenticated current artist receives it in that player's response. Guesser snapshots omit the word; public snapshots omit answer keys and only reveal them on results.
- The Function validates room codes, nicknames, avatars, room capacity, host authority, game phase, drawing bounds, guess text, answer locks, and all scoring.
- Timers are deadline timestamps in the stored match. Requests advance due transitions, which lets the stages continue without a background process. If nobody polls during a deadline, the next transition occurs on the next request.
- The state machine keeps Draw & Guess, Reflex Rumble, Brain Glitch (five questions), Chaos Finale, scores, and the final champion reveal.

## Environment and limits

- No custom environment variables are required. Netlify injects site credentials for Blobs inside deployed Functions.
- `netlify.toml` pins Node.js 24.22.1, publishes `dist`, and selects `netlify/functions`.
- There is no Socket.IO service, WebSocket URL, `CLIENT_ORIGIN`, or production `localhost` dependency. Vite's localhost URLs are only for local development.
- Blob room records currently have no scheduled cleanup or TTL. Disconnected seats remain reserved; older records need manual removal from the site's Blobs panel.
- There is no live provider load test or multi-process test yet. Function calls and stored state are subject to the Netlify account's plan limits and pricing.
