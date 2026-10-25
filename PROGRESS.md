# Netlify packaging verification

## Implemented in this isolated copy

- Preserved the existing React visual design, lobby, room-code invites, avatars, drawing canvas, scoreboard, and four complete match stages.
- Replaced the Socket.IO client/server path with the direct `/.netlify/functions/game` endpoint. The browser uses short JSON requests, server polling, local resume tokens, and batched drawing packets.
- Added a Netlify Function and a helper outside `netlify/functions`. Room state, private prompts, scores, and phase deadlines are stored per room in Netlify Blobs.
- Configured strong consistency and documented conditional writes from the installed `@netlify/blobs` 11.1.6 SDK. Added stale-write retries, storage-error detection for missing conditional-write ETags, and request-side authorization/validation.
- Added Netlify Vite plugin setup for local Functions/Blobs emulation, Node version pin, and browser-upload deployment notes.

## Checks actually run

- Clean package installation from `pnpm-lock.yaml`: **pass** in a fresh staging copy.
- TypeScript type check and production frontend build: **pass** from the clean staging copy (`pnpm build` runs `tsc -b` followed by `vite build`).
- Packaged Netlify Function tests: **pass**, 2 tests. Two independent player tokens create/join and play through drawing, Reflex, all five quiz questions, Finale, scoring, and final results. Tests also cover hidden word/answer data, room isolation, stroke synchronization, simultaneous quiz answers, and duplicate concurrent guesses.
- Original working copy test run: **pass**, 6 tests across the Function match tests and copied legacy room tests. Only the Function match tests are included in the ZIP because the old server is not part of the Netlify deployment.
- Local Netlify Vite runtime: **not verified**. The plugin started but the sandbox prevented esbuild from traversing its package working directory, so the Function request could not be served locally.
- Separate function bundle using esbuild: **not verified** for the same Windows sandbox access-denied error. TypeScript includes and checks the Function, but this environment did not complete the deployment bundling step.
- Netlify account deployment and public URL: **not run**. No Netlify site was linked, and no URL is claimed.
- Browser-based full match: **not run**. The full match was exercised through two independent authenticated Function requests in packaged tests, not through two browser windows.

## Remaining limitations

- Polling causes more Function requests than a persistent socket connection.
- Netlify Blobs room records do not currently expire automatically.
- No live Netlify Blobs test or public deployment has confirmed production runtime behavior.
- Netlify's source-folder upload requires a logged-in account and extraction of the ZIP first. Anonymous Drop publishes files as-is and is not suitable for this Function project.
