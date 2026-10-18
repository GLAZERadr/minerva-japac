# MINERVA – Industrial Intelligence Platform

Digital-twin dashboard for a sustainable aluminium smelter line: live
monitoring, 3D twin, simulation, product (lot) data and an AI assistant.
Next.js 15 static export, deployed to Firebase Hosting (`minerva-apac`).

| Route       | What it is                                                    |
| ----------- | ------------------------------------------------------------- |
| `/`         | Factory dashboard (3D twin, sensors, simulation, Ask AI)      |
| `/compro`   | Company profile                                               |
| `/twin`     | Previous homepage with the legacy top/bottom bars             |
| `/geogemma` | GeoGemma-style Earth-observation demo (mock data)             |

## Getting started

```bash
npm ci --legacy-peer-deps
npm run dev        # http://localhost:3000
npm run check      # typecheck + production build (outputs to out/)
```

## Environment (`.env.local`)

| Variable                          | Purpose                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`        | Go API base URL. Defaults to `https://minerva-api-go.fly.dev`. |
| `NEXT_PUBLIC_DATA_MODE`           | `auto` (default), `mock` or `live` — see below.                |
| `NEXT_PUBLIC_GEMINI_API_KEY`      | Google AI Studio key for Gemma 4 (Ask AI + prescriptive text). |
| `NEXT_PUBLIC_FIREBASE_*`          | Firebase web config — enables Cloud Firestore (lots, alerts).  |
| `NEXT_PUBLIC_FIREBASE_EMULATOR`   | `1` to use the local Auth + Firestore emulators.               |

Because the site is a static export, `NEXT_PUBLIC_*` values are baked in at
build time — set them before `npm run build`.

## Data sources and demo fallback

Every feature that needs the backend checks `GET /health` first
(`src/lib/backend.ts`) and falls back to bundled demo data when it is
unreachable, so the app never sits on an endless spinner.

| Feature             | Live source                       | Fallback                                        |
| ------------------- | --------------------------------- | ----------------------------------------------- |
| Sensor stream       | `GET /api/influx/stream` (SSE)    | Generated readings (`src/lib/sensor-feed.ts`)   |
| Product data        | Cloud Firestore `products` (live) → `/api/products` | Seeded lots in localStorage (`src/lib/products.ts`) |
| Ask AI              | `POST /api/chatbot/query`         | Gemma 4 → offline answers (`src/lib/demo-answers.ts`) |
| Notifications       | Cloud Firestore `notifications` (live) → `/api/notifications` | `public/notification-data.json`  |
| Simulation report   | —                                 | Computed from inputs (`src/lib/simulation-report.ts`) |

- `auto`: use the backend when `/health` answers, otherwise demo data. The top
  bar shows **Live** (green) or **Demo** (blue).
- `mock`: never call the backend — use this for demo recordings.
- `live`: backend only; failures show an error with a Retry button after 10 s.

To reset the demo lots between takes, clear the
`minerva.demo.products.v1` localStorage key.

## Cloud Firestore (product lots and alerts)

When the `NEXT_PUBLIC_FIREBASE_*` web config is set, the dashboard signs in
anonymously and reads/writes `products` and `notifications` in Cloud
Firestore with live updates (`src/lib/firestore.ts`). Without it, everything
falls back as described above. The Go API is not involved.

One-time setup in project `minerva-apac`:

1. Firebase console → Build → Firestore Database → Create database.
2. Authentication → Sign-in method → enable **Anonymous**.
3. Register the web app and copy its config into `.env.local` (and the
   Hosting build): `npx firebase-tools apps:sdkconfig WEB <APP_ID> --project minerva-apac`.
4. Deploy the rules: `npm run deploy:rules` (see `firestore.rules`: signed-in
   reads, validated lot writes, alerts are read-only for the app).
5. Seed the demo data: `gcloud auth application-default login`, then
   `npm run seed:firestore -- --reset` (also the reset between demo takes).

Local testing without touching the real project:

```bash
npm run emulators -- --project demo-minerva
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_PROJECT_ID=demo-minerva npm run seed:firestore -- --reset
NEXT_PUBLIC_FIREBASE_EMULATOR=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-minerva \
  NEXT_PUBLIC_FIREBASE_API_KEY=demo-key NEXT_PUBLIC_FIREBASE_APP_ID=demo-app npm run dev
```

## Backend checklist (outside this repo)

1. Bring the Fly.io app back up (`fly status`, scale to ≥ 1 machine, disable
   auto-stop for the demo window).
2. Set `NEXT_PUBLIC_API_BASE_URL` in the Firebase Hosting build and redeploy.
3. Allow CORS from `https://minerva-apac.web.app` on the Go API, including SSE.
4. Add `GET /health` (200 when MySQL and InfluxDB are reachable) and, ideally,
   `GET /api/notifications`.
5. Deck wording: Firebase Cloud Functions cannot run Go, so the backend box
   should read "Go API (telemetry, AI agent)" rather than "Cloud Functions".
