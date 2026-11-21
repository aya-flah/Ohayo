# Sonae (備え)

**Prepared, nothing to fear.** Sonae keeps irrigation going in Tunisian farming communities when STEG cuts the power. It pumps water up into the tank while there is energy, irrigates by gravity when the cut comes, and sends every farmer a fair turn by SMS. Neighbours can also share spare water and solar energy through **Yui**, an escrowed exchange on the Sepolia test network.

Built at the Kizuna 2026 hackathon.

- **New to the project? Read the team guide first:** [`docs/Sonae_Team_Guide.pdf`](docs/Sonae_Team_Guide.pdf) (15 pages, plain English).
- **Full plan, Dev spec and Task board:** the "Sonae Master Plan" doc. Ask the team lead for the link.

## What's in this repo

One repo holds both the website and the Android app, plus everything they talk to. Both apps are called **Sonae**; Yui is the name of the sharing page inside them.

| Path | What it is | Owner |
| --- | --- | --- |
| `apps/web` | The website (React PWA): 48-hour plan, 3D twin, Yui exchange, Summer Replay, settings | P2 |
| `apps/mobile` | The Android app: Capacitor wrapping the `apps/web` build (`android/` is committed) | P2 |
| `apps/api` | The server: plans, Claude features with a $20 budget guard, SMS previews, Yui delivery oracle | P4, P1 |
| `packages/engine` | The 48-hour planner, Derja SMS and the Summer Replay simulator | P1 |
| `packages/shared` | Types everyone codes against, crop table, demo GDA, schemas | Everyone |
| `firmware` | ESP32 node code and the Wokwi circuit | P3 |
| `contracts` | Solidity: `SonaeExchange` (Yui escrow) and `LedgerAnchor` | P4 |
| `data` | Summer 2026 weather fetch script and cache | P1 |
| `docs` | Team guide and its source | Everyone |

## Quick start

You need Node 22+ and Git.

```bash
npm install                 # every workspace
npm test                    # engine tests (Hedi scenario, fairness, SMS, replay)
npm run dev:web             # website on http://localhost:5173
npm run dev:api             # API on http://localhost:8787 (copy apps/api/.env.example to .env first)
npm run weather:fetch       # refresh the real Kairouan summer 2026 weather for the Replay
```

### Smart contracts (Yui)

```bash
npm run contracts:install
npm run contracts:test                  # 11 tests
npm run contracts:node                  # local chain (keep it running)
npm run contracts:deploy:local          # deploy to it; addresses go to apps/web/src/web3/sonae-contracts.json
npm run contracts:deploy:sepolia        # needs contracts/.env (test wallet + RPC); never commit it
```

Then open the Yui page with MetaMask on Sepolia (or on `localhost:8545`, chain 31337).

### Android app

```bash
npm run mobile:sync     # builds the website and copies it into apps/mobile/android
npm run mobile:open     # opens Android Studio; press Run, or build an APK there
```

Android Studio's bundled JDK 21 is the easiest way to build. The app is named Sonae, with the 備 icon.

### Firmware

See [`firmware/README.md`](firmware/README.md): run it in Wokwi in five minutes, then flash the real ESP32 with PlatformIO.

## Team rules

- Never commit keys. Every `.env` file is ignored by Git; copy the matching `.env.example` instead.
- Pull often and push small commits. Merge points: 19:30, 21:00, 00:30 and 09:00.
- Only numbers produced by our simulation go into the pitch.

## Credits

Weather data by [Open-Meteo](https://open-meteo.com) (CC BY 4.0). Typefaces: Shippori Mincho B1 and Zen Kaku Gothic New (SIL OFL).
