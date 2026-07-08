# Monopoly Deal

Real-time multiplayer Monopoly Deal card game for 2-4 players.

<img width="552" height="529" alt="Screenshot 2026-07-08 at 11 26 20 AM" src="https://github.com/user-attachments/assets/c414f529-e15e-453f-9f01-7b381edf29e9" />

## Run

```
npm install
npm start
```

Open http://localhost:3000, create a room, and share the 4-letter code.
Other players on the same network can join at `http://<your-lan-ip>:3000`.

## How it works

- `server/cards.js` — the full 106-card deck definition
- `server/game.js` — server-authoritative rules engine (turns, rent, payments, Just Say No chains, win detection)
- `server/index.js` — Express + Socket.IO room handling with reconnect support
- `public/` — the client: rendering, modals, and card animations

First to collect 3 complete property sets wins.
