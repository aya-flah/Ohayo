# Sonae (備え)

**Prepared, nothing to fear.** Sonae keeps irrigation going in Tunisian farming communities when STEG cuts the power. It pumps water up into the tank while there is energy, then irrigates by gravity when the cut comes, with fair turns sent to every farmer by SMS.

Built at the Kizuna 2026 hackathon.

- **New to the project? Read the team guide first:** [`docs/Sonae_Team_Guide.pdf`](docs/Sonae_Team_Guide.pdf) (15 pages, plain English).
- **Full plan:** the "Sonae Master Plan" doc. Ask the team lead for the link.

## What's in this repo

One repo holds both the website and the Android app, plus everything they talk to.

| Path | What it is | Owner |
| --- | --- | --- |
| `apps/web` | The website (React PWA): 48-hour plan, 3D twin, Summer Replay, Yui exchange | P2 |
| `apps/mobile` | The Android app: Capacitor wrapping `apps/web` | P2 |
| `apps/api` | The server: plans, SMS, Claude, ledger, delivery oracle | P4, P1 |
| `packages/engine` | The 48-hour planner and the Summer Replay simulator | P1 |
| `packages/shared` | Types everyone codes against, crop table, demo data | Everyone |
| `firmware` | ESP32 node code and the Wokwi simulation | P3 |
| `contracts` | Sepolia smart contracts: Yui exchange and ledger anchor | P4 |
| `data` | Weather fetch script and cache | P1 |
| `docs` | Team guide and its source | Everyone |

## Quick start

You need Node 22 or newer and Git. For the Android app, Android Studio. For the firmware, VS Code with PlatformIO, or just [wokwi.com](https://wokwi.com).

```bash
npm install          # installs every workspace
npm test             # engine tests
npm run dev:web      # website on http://localhost:5173
npm run dev:api      # API on http://localhost:8787
```

Smart contracts live in their own package:

```bash
npm run contracts:install
npm run contracts:test
```

## Team rules

- Never commit keys. Every `.env` file is ignored by Git; copy the matching `.env.example` instead.
- Pull often and push small commits. Merge points: 19:30, 21:00, 00:30 and 09:00.
- Only numbers produced by our simulation go into the pitch.

## Status

This first push is the skeleton, so everyone can clone it now. The engine, contracts, API, website and mobile app arrive in the next pushes. Follow progress on the Task board tab of the plan doc.
