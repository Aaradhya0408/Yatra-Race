# Yatra Race: World Tour

A responsive, no-login, real-time multiplayer landmark trivia race for 2–8 players. Built with Node.js, Express, Socket.IO, vanilla JavaScript, and optional PostgreSQL persistence.

## Features in this starter

- Room creation with a six-character code and invite URL
- Guest nicknames and playful avatar selection
- World Tour and Bharat Yatra theme packs
- Ten unique landmarks selected at random from the theme bank
- Shared question display with rotating, server-controlled turns
- Four answer choices, two tries per turn, 8-second turn timer
- Server-authoritative answer validation and movement
- Real-time room state, standings, finish screen, and rematch
- Signed reconnect tokens saved in local storage
- Responsive phone/laptop layouts and a short How to Play dialog
- `/health` endpoint for deployment checks
- Optional PostgreSQL room snapshots and restoration

## Run locally

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm start
```

Open <http://localhost:3000> in two separate browser profiles/devices. Create a room in one and join with the code in the other. If `DATABASE_URL` is absent, rooms are held in memory and do not survive a server restart. PostgreSQL is recommended for durable recovery.

## PostgreSQL setup

Create a PostgreSQL database (for example, on Neon), set `DATABASE_URL`, and set `PGSSL=true` if the provider requires TLS. On boot, the server creates the `game_rooms` table and restores recent snapshots. Set a long random `TOKEN_SECRET` in production. Never commit `.env` or secrets.

## Deploy

This project is a single Node.js service, so it can be deployed to a Node-compatible host that supports persistent WebSocket connections (for example, Render). Connect this repository, use build command `npm install`, start command `npm start`, and configure `DATABASE_URL`, `PGSSL=true`, and a strong `TOKEN_SECRET`. The service serves the frontend and Socket.IO from the same origin, avoiding cross-origin WebSocket configuration in the common case. Add your deployed origin to `ALLOWED_ORIGINS` if you want to restrict Socket.IO origins.

A public link is **not created by this source package alone**: deployment requires a hosting account and a configured database. Once deployed, verify `/health` and test from separate devices before sharing broadly.

## Multiplayer test checklist

1. Create a room; confirm six-character code and host badge.
2. Join with a second browser and a distinct nickname; confirm both lobbies update.
3. Confirm a third through eighth player can join and a ninth is rejected.
4. Try starting with one player (blocked), then start with two.
5. Confirm all clients see the same current landmark, prompt, choices, active player, and timer.
6. Attempt to submit from a non-active player; it must not move them.
7. Submit a wrong answer; confirm one retry, then turn advances after the second wrong answer.
8. Submit a correct answer; confirm only that player's token advances one stop.
9. Refresh a player browser and confirm the reconnect token restores their seat.
10. Disconnect the active player; confirm the grace period then skipped turn.
11. Complete a game and confirm rankings and Play Again.
12. Restart the server with PostgreSQL configured and confirm persisted room snapshots are restored.
13. Check narrow phone view, long nicknames, reduced-motion preference, and keyboard focus.

## Notes / known first-release limitations

- The included question bank is intentionally small but has more than ten choices per theme. Add reviewed questions in `server.js` to grow it.
- In-memory mode is for local development only; it does not survive process restarts.
- PostgreSQL snapshots are persisted on room broadcasts. A production-hardening pass should add database migrations, atomic transaction handling for concurrent server instances, structured logging, and load testing before high-traffic use.
- This is a source implementation, not a claim of an already deployed public website. Hosting credentials must be supplied by the project owner.
