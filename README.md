
# 777 Slot Demo — Server‑Authoritative + Admin Panel

A simple **3‑reel, 1‑line slot** that cleanly separates concerns:

- **Server (NestJS, TypeScript)** — _all_ RNG & game logic (authoritative).
- **Client (React + Vite + PixiJS)** — rendering only.
- **Admin Panel (React + Vite)** — change game config at **runtime** (with validation, import/export, live math).

> This README shows how to run everything on Windows/macOS/Linux and how the admin panel works end‑to‑end.

---

## 0) Requirements

Install:

- **Node.js 18+** (includes npm)
- **Git** (to clone/pull)
- Optional: VS Code

No global CLIs are required — we use `npm` scripts.

---

## 1) Clone

```bash
git clone https://github.com/<your-username>/slot-777.git
cd slot-777
```

Directory layout (simplified):

```
slot-777/
  server/   # NestJS backend (authoritative RNG + math + admin API)
  client/   # Player UI (PixiJS)
  admin/    # Config UI (edit runtime game-config through admin API)
```

---

## 2) Configure

### 2.1 Server (NestJS)

Create **`server/.env`**:

```env
PORT=3001
HMAC_SECRET=dev-secret        # used to sign each spin result
ADMIN_TOKEN=dev-admin-token   # admin API bearer; used by the admin panel
```

> Change the secrets in production. Keep `.env` out of Git.

### 2.2 Player Client (Pixi)

Create **`client/.env.local`**:

```env
VITE_API_URL=http://localhost:3001
# Optional: verify HMAC on the client too
VITE_HMAC_SECRET=dev-secret
```

### 2.3 Admin Panel

Create **`admin/.env.local`**:

```env
VITE_API_URL=http://localhost:3001
VITE_ADMIN_TOKEN=dev-admin-token
```

---

## 3) Install

Open a terminal in `slot-777` root and run:

```bash
# server deps
cd server && npm i

# client deps
cd ../client && npm i

# admin deps
cd ../admin && npm i
```

---

## 4) Run (development)

Use three terminals (or split panes).

### Terminal A — Server

```bash
cd slot-777/server
npm run start:dev
```
Server: **http://localhost:3001**

### Terminal B — Player Client

```bash
cd slot-777/client
npm run dev
```
Vite will print a URL (usually **http://localhost:5173**). Open it and press **SPIN**.

### Terminal C — Admin Panel

```bash
cd slot-777/admin
npm run dev
```
Vite will print another URL (e.g. **http://localhost:5174** if 5173 is used).

> If ports collide, pass `--port 5174` to the `dev` script or let Vite pick a free one interactively.

---

## 5) How the Game Works (high‑level)

- The **client** only renders symbols. It **requests a spin** from the server.
- The **server**:
  - Picks random stops from `reels`,
  - Computes the payout via `pay3` and extra rules,
  - Debits/credits the session balance,
  - Signs the result with `HMAC_SECRET` and returns `{ spinId, reelStops, winMinor, breakdown }`.
- The client can optionally **verify** the signature using `VITE_HMAC_SECRET`.

---

## 6) Where to Change Game Parameters (manually)

All designer knobs live in `server/src/game-config.ts`:

- `startBalanceMinor` — initial balance for a new guest.
- `reels` — symbol strips (probabilities).
- `pay3` — multipliers for 3‑of‑a‑kind.
- `anyTwoSevensMult`, `anyTwoCherriesMult`, `singleCherryMult` — extra rules.
- `minBetMinor`, `allowOverBalance` — bet limits.

Restart the server to apply manual changes. **OR** use the **Admin Panel** to change these at runtime without restarts.

---

## 7) Admin Panel — From Launch to Save

1. Start the server (`npm run start:dev` in `server/`).  
2. Start the admin UI (`npm run dev` in `admin/`).  
3. Open the admin URL (e.g. `http://localhost:5174`).  
4. The panel calls the admin endpoints with header **`x-admin-token: VITE_ADMIN_TOKEN`**.

### Main actions

- **Reload** – fetch current live config from the server.
- **Reset** – restore defaults on the server (use with care).
- **Save** – validate locally, then `PUT` the config to the server.
- **Health** – ping `/api/v1/health` to see server availability/uptime.
- **Import** – upload a JSON file with the config shape; applies locally (not saved yet).
- **Export** – download the current local config as JSON (backup/share).
- **Ctrl/⌘ + S** – quick save shortcut (while not focused in an input).

### Fields explained

- **Economy** — `startBalanceMinor`, `minBetMinor`, `allowOverBalance` switch.
- **3 of a Kind (pay3)** — multipliers for exact triples (`Seven`, `Bar`, `Bell`, `Cherry`, `Lemon`).
- **Extra Rules** — `anyTwoSevensMult`, `anyTwoCherriesMult`, `singleCherryMult`.
- **Reels** — edit each reel as comma/space‑separated symbols.  
  Use **Normalize** to fix accidental casing like `seven` → `Seven`.

### Live Math (theoretical)

The panel computes **RTP**, **Hit Rate**, and a few event probabilities from the current local config, so you can see the impact before saving. This is an approximate calculation derived from reel symbol frequencies (not a Monte‑Carlo run).

### Validation

Client‑side validation prevents bad saves (e.g., empty reel, invalid symbol). The server validates again. If something is wrong you’ll see an error banner with details.

---

## 8) Admin API (server)

- `GET  /api/v1/admin/config` — read current config.  
- `PUT  /api/v1/admin/config` — replace config (requires header `x-admin-token`).  
- `POST /api/v1/admin/config/reset` — reset to defaults (requires header).  
- `GET  /api/v1/health` — basic health/uptime (no auth).

> The server stores the live config in memory (via `ConfigStore`). Changes are **immediate** for new spins.

Auth header example:
```
x-admin-token: dev-admin-token
```

---

## 9) Player Endpoints (for reference)

- `POST /api/v1/auth/guest` → `{ sessionId }`
- `GET  /api/v1/wallet/balance` (header `x-session-id`)
- `POST /api/v1/slot/spin` body `{ betMinor }` (header `x-session-id`)  
  Response includes an **HMAC signature** of `spinId|stops|win`.

---

## 10) Troubleshooting

- **Admin panel opens but Save does nothing**  
  Check `VITE_ADMIN_TOKEN` matches server `ADMIN_TOKEN`. See DevTools → Network.
- **Client says “Failed to fetch”**  
  Server not running or `VITE_API_URL` is wrong.
- **Signature mismatch**  
  Make sure client `VITE_HMAC_SECRET` equals server `HMAC_SECRET`.
- **Two Vite apps want the same port**  
  Run the second with `npm run dev -- --port 5174`.

---

## 11) Production notes (quick)

- Put the server behind HTTPS and a reverse proxy (nginx, Caddy).  
- Use **real secrets** for `HMAC_SECRET` / `ADMIN_TOKEN`.  
- Lock down the admin API to VPN/IP allowlist.  
- Persist balances/sessions in a DB if you need durability (the demo uses in‑memory maps).

---

## 12) Git quick commands

```bash
# add, commit, push
git add -A
git commit -m "docs: README for admin panel & setup"
git push

# if remote has new commits
git pull --rebase origin main
git push
```

---

Enjoy and tweak responsibly 🎰
