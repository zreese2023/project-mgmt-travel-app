# Wayfarer

A travel and tourism web app prototype for a project management class: search destinations, compare
flights and hotels, check the weather and build a day-by-day itinerary.

**All flights, hotels and prices are fictional sample data.** Nothing can be booked or paid for.
Weather and travel advisories are live data from the free Open-Meteo and U.S. State Department
services, so those need an internet connection (the app still works without it).

## What it does (Sprint 1 MVP, ConOps 5.1)

- **Destination search and filtering:** keyword search plus region, budget and interest filters, and a
  details page with a photo, description and activities.
- **Flights and hotels:** search, filter and sort, then select a result and add it to a trip.
- **Itinerary builder:** create a trip, then add, edit, move up or down, and remove activities,
  flights and hotels on a day-by-day timeline. Trips are saved to your account.
- **Travel advisories:** each destination shows the U.S. Department of State travel advisory for its
  country (level 1 to 4) with a link to the full text. If that service cannot be reached, a made-up
  sample advisory is shown instead, clearly labelled. Wayfarer is not an official source.
- **Weather popup:** current conditions and a 5-day forecast from the free
  [Open-Meteo](https://open-meteo.com/) API, with a friendly message if it cannot be reached.
- **Accounts:** register, sign in and sign out.

## Prerequisites

- [Node.js](https://nodejs.org/) 22.12 or newer (developed on Node 24)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (runs PostgreSQL 16). Make sure it
  is running before you start the database.

## Run it

From the project root:

```bash
npm run setup     # first time only: installs packages, starts Postgres, creates and seeds the databases
npm run dev       # starts the API (port 3001) and the web app (port 5173)
```

Then open **http://localhost:5173** (use `localhost`, not `127.0.0.1`).

**Demo login:** `demo@wayfarer.test` / `wayfarer123`, or create your own account.

On later days you only need `npm run db:up` (if the database container is stopped) followed by
`npm run dev`. Stop the app with Ctrl+C, and stop the database with `npm run db:down`.

### Try this

1. Search "tokyo" under **Destinations**, open it and click the weather badge.
2. Under **My trips**, create a trip to Tokyo.
3. Open **Flights** (or use "Find flights" inside the trip), search, select a flight and choose
   **Add to trip**. Do the same with a hotel.
4. Open the trip to see the timeline. Add your own activity, such as "Visit Shibuya station" at 1:00 pm,
   then edit it, move it up or down, or remove it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Install packages, start Postgres, initialise the databases |
| `npm run dev` | Start the API and the web app with live reload |
| `npm run db:up` / `npm run db:down` | Start / stop the Postgres container |
| `npm run db:init` | **Wipe and recreate** both databases, then reseed (see below) |
| `npm test` | Run all tests (server unit and integration, client unit and component) |
| `npm run test:coverage` | Same, with a coverage report and the 90% line thresholds |
| `npm run typecheck` | Type-check the server and the client |
| `npm run lint` / `npm run format:check` | Lint and formatting checks (`npm run format` fixes formatting) |
| `npm run build` | Production build of the server (`server/dist`) and client (`client/dist`) |

The integration tests need Postgres running, so run `npm run db:up` and `npm run db:init` first.
Unit and component tests need no database and no network.

### Refreshing the sample data

Flights are generated for the 90 days after the day you run `npm run db:init`. When the search shows
no flights for your dates, run `npm run db:init` again. **This deletes every account, trip and
itinerary** in both databases, then recreates the demo account.

## Configuration

Everything works with the defaults. To change them, set environment variables (see
[.env.example](.env.example); there is no `.env` loader, so set them in your shell):

| Variable | Default |
| --- | --- |
| `PORT` | `3001` (API) |
| `DATABASE_URL` | `postgres://wayfarer:wayfarer@localhost:5432/wayfarer` |
| `TEST_DATABASE_URL` | `postgres://wayfarer:wayfarer@localhost:5432/wayfarer_test` |
| `WAYFARER_DB_PORT` | `5432` (host port of the Postgres container) |
| `JWT_SECRET` | a built-in development value; **required** when `NODE_ENV=production` |

## Troubleshooting

- **"failed to connect to the docker API" on `db:up`:** Docker Desktop is not running. Start it, wait
  until it says it is running, and try again.
- **Port 5432 is already in use:** another Postgres is running. Set `WAYFARER_DB_PORT=5433` and point
  `DATABASE_URL` and `TEST_DATABASE_URL` at port 5433 before running the database commands.
- **The page will not open at `127.0.0.1:5173`:** use `http://localhost:5173`.
- **Searches or sign-in show a server error:** the database is down or was never initialised. Run
  `npm run db:up` then `npm run db:init`.
- **An `esbuild` install-script warning from npm:** harmless; everything runs without approving it.
  If `npm run dev` ever fails with an esbuild error, run `npm install-scripts approve esbuild`.

## Project layout

```
client/   Vue 3 + TypeScript web app (Vite)
server/   Fastify + TypeScript API (plain SQL on PostgreSQL)
db/       schema.sql and seed.sql (sample data)
docs/     requirements, backlog, architecture and planning documents
```

Stack: Vue 3, Vue Router, Pinia, Fastify, PostgreSQL 16, Vitest. Planning documents live in
[docs/](docs/): the [backlog](docs/backlog.md) tracks story scope and status, and the
[architecture](docs/architecture.md) describes the target design (only the Sprint 1 part is built).
