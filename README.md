# CHAOS ARENA — Netlify upload project

**12 Players. 1 Arena. Absolutely No Peace.**

This is an upload-ready copy of CHAOS ARENA. It keeps the existing React game and all four stages, replaces the always-on Socket.IO server with a Netlify Function, and stores shared rooms in Netlify Blobs.

## Deploy in a browser

1. Sign in to a Netlify account. A Netlify account is required for a lasting site and for the site's Functions and Blobs.
2. Download and extract `netlify-ready-game.zip` so the folder contains `netlify.toml`, `package.json`, and `pnpm-lock.yaml` at its top level.
3. In the logged-in Netlify dashboard, create a project using the browser upload flow and upload the extracted project folder. Keep the project root selected; do not upload `src` or `dist` by itself.
4. Netlify reads `netlify.toml`, installs the locked dependencies, builds the frontend, and deploys `netlify/functions/game.ts` as `/.netlify/functions/game`.
5. Open the resulting site URL in two separate browser windows to play together.

Netlify's basic Drop flow expects an extracted folder rather than a ZIP. Netlify documents that logged-in uploads can build a source project; anonymous Drop publishes files as-is and cannot build this Functions project. The upload workflow may present a project-creation or visibility step. If the team defaults new projects to private, change visibility to public before sharing the URL.

Netlify Blobs is provisioned by Netlify when the deployed Function uses it. This project needs no user-supplied API key, no separately created database, and no manually entered environment variables. Netlify supplies its own site access context to the Function.

## Local development

Requires Node.js 22.12 or newer and pnpm 11.25. The Netlify Vite plugin emulates the Function and Blobs locally.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite address shown in the terminal. The local Blobs emulator is separate from the production site's data.

## Verification commands

```sh
pnpm exec tsc --noEmit
pnpm build
pnpm test
```

The game Function uses one strongly consistent Blob per room. Updates use the documented `onlyIfNew` and `onlyIfMatch` conditions and retry on stale ETags. The Function revalidates identity and game rules on every request. The browser polls every 1.5 seconds; drawing packets are batched before sending.

## Known limitations

- Netlify Functions use request/response calls, so lobby updates are polling-based rather than instant WebSocket pushes.
- A match advances when a player polls or acts. If everyone disconnects, transitions resume when a player reconnects.
- Rooms are durable Blobs and currently have no automatic cleanup job. Active matches and disconnected seats survive deploys, but old room records remain until manually removed from Netlify Blobs.
- The application targets a single room record per action and uses conditional writes for conflict detection. It has not been load-tested against a live Netlify Blobs service.
- Function request volume grows with active player count because of polling and drawing uploads. Review Netlify usage if a large group plays for long sessions.
- This package has not been deployed from a Netlify account in this environment. No public URL is being claimed.
