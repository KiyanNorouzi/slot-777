# 777 Slot Demo

A simple **3-reel, 1-line slot** to show a clean separation of frontend (visual only) and backend (all math & RNG).

- Frontend: React + TypeScript + Vite + PixiJS
- Backend: NestJS + TypeScript
- All game logic and randomness lives on the **server**.

---

## 1. Requirements (on Windows, macOS, Linux)

Please install:

- **Node.js** (v18 or newer)
- **npm** (comes with Node)
- **Git** (for cloning the repo)
- A code editor (recommended: VS Code, optional)

You do **not** need any global Nest/Vite CLI; we use `npm` scripts.

---

## 2. Clone & Install

In a terminal:

```bash
git clone https://github.com/<your-username>/slot-777.git
cd slot-777
```

Install backend dependencies:

```bash
cd server
npm install
```

Install frontend dependencies:

```bash
cd ../client
npm install
cd ..
```

---

## 3. Configure

### Backend: `server/.env`

Create a file `server/.env`:

```env
PORT=3001
HMAC_SECRET=dev-secret
```

### Frontend: `client/.env.local`

Create a file `client/.env.local`:

```env
VITE_API_URL=http://localhost:3001
```

These defaults assume both run on your machine.

---

## 4. Run (Development)

Use two terminals.

### Terminal 1 — Backend

```bash
cd slot-777/server
npm run start:dev
```

Backend will listen on:

```txt
http://localhost:3001
```

### Terminal 2 — Frontend

```bash
cd slot-777/client
npm run dev
```

Open the URL Vite prints (usually):

```txt
http://localhost:5173
```

You should see the slot:

- Click **SPIN** to play.
- Bet and balance are shown on top.
- All results come from the backend.

---

## 5. Where to Change Game Parameters

All tuning knobs for designers are in:

### `server/src/game-config.ts`

Here you can safely edit:

- `startBalanceMinor` — starting balance.
- `reels` — symbol strips for each reel (controls probabilities).
- `pay3` — payout multipliers for 3-of-a-kind.
- `anyTwoSevensMult`, `anyTwoCherriesMult`, `singleCherryMult` — extra rules.
- `minBetMinor` and `allowOverBalance` — bet limits.

The frontend **does not** contain any authoritative game logic.

After changing `game-config.ts`, restart the server:

```bash
cd slot-777/server
npm run start:dev
```

---

## 6. Basic Troubleshooting

- If the frontend shows **"Failed to fetch"**:
  - Check backend is running on `http://localhost:3001`.
  - Check `VITE_API_URL` matches the backend URL.
- If you see **"Unauthorized"**:
  - Refresh the page to get a new guest session.
- Do **not** commit `.env` files or `node_modules` to Git.

---
