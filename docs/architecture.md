# Wayfarer Architecture

> **Build status (2026-10-22):** only the Sprint 1 MVP is built. Booking, payments, notifications, profile editing, admin and the related tables, routes and flows described below are the *target design* for later sprints and are **not in the code** right now. See the re-scoping log in [backlog.md](backlog.md).

Requirements: [project-docs.txt](project-docs.txt). Stories: [backlog.md](backlog.md). Stack is fixed by `CLAUDE.md`: Vue 3 + Vue Router + TypeScript (Vite), Fastify + TypeScript, PostgreSQL 16 with plain SQL (`pg` / `@fastify/postgres`), Vitest.

## 1. Components

```mermaid
flowchart LR
  subgraph Browser["Browser: Vue 3 SPA (client/)"]
    V[views + components]
    S[stores]
    A[api client]
    U[utils: pure logic]
    V --> S --> A
    V --> U
  end
  subgraph Server["Fastify API (server/)"]
    R[routes: thin handlers + JSON schema]
    P[auth hook, error handler]
    L["lib/: pure logic and DB services<br/>pricing, cards, refunds, advisory, weather,<br/>reorder, alert rules"]
    R --> P
    R --> L
  end
  DB[(PostgreSQL 16)]
  W[Open-Meteo weather API]
  A -- "/api (JSON, httpOnly cookie)" --> R
  L -- "parameterised SQL" --> DB
  L -- "fetch + 10 min cache + 5 s timeout" --> W
  L -. "simulated" .-> M[(email_outbox table)]
  L -. "mock processor" .-> PAY[payment mock in lib/]
```

Design rules that follow from the brief:

- **Routes are thin; logic lives in `server/src/lib/`.** Business rules are pure functions or take a small `Queryable` interface (`query(text, params)`), so unit tests pass a mocked client (cancel/refund) and integration tests pass the real pool. This is also what makes the 90% coverage target on `lib/` realistic.
- **Same idea on the client:** `client/src/utils/` holds pure logic (reorder, debounce, date maths, formatting, card brand hints) and `client/src/api/` the typed fetch wrapper; both have a 90% line threshold in `vite.config.ts`.
- **The server owns money.** Totals are computed in `lib/pricing.ts` from DB prices; request schemas have no amount field.
- **External calls degrade, never crash.** Weather failures return an "unavailable" payload with HTTP 200 so the page keeps working.

## 2. Repository layout

```
client/   Vue SPA          src/{api,components,router,stores,utils,views}
server/   Fastify API      src/{routes,lib,plugins}, scripts/db-init.ts, test/{unit,integration}
db/       schema.sql, seed.sql
docs/     backlog, sprint plan, risks, architecture, test strategy, sprint reviews
.github/workflows/ci.yml
docker-compose.yml        Postgres 16
```

API response types are declared in `server/src` and mirrored in `client/src/api/types.ts` (the layout is fixed by `CLAUDE.md`, so there is no shared package). Integration tests assert response shapes so a drift between the two fails the build.

## 3. Conventions

- **Money:** `numeric(10,2)` in Postgres; a `pg` type parser returns `number`; arithmetic is done in integer cents in `lib/money.ts` and converted back at the edge. Currency is USD only.
- **Dates:** `date` columns are parsed to `'YYYY-MM-DD'` strings (no `Date` objects, so no timezone shifts); `timestamptz` for instants (flight times, created_at).
- **Auth:** scrypt password hashes (Node `crypto`); session in an httpOnly, SameSite=Lax cookie holding a signed JWT; roles `user` and `admin`. Every user-owned query filters on `user_id`; other users' rows return 404.
- **Errors:** one error shape, `{ "error": { "code": "...", "message": "..." } }`; validation by Fastify JSON schema.
- **Sample data:** every flight, hotel, price and advisory view carries a "Sample data" label (advisories: "Illustrative, not official guidance").

## 4. Data model

```mermaid
erDiagram
  users ||--o{ trips : owns
  users ||--o{ bookings : makes
  users ||--o{ payment_methods : saves
  users ||--o{ notifications : receives
  users ||--o{ email_outbox : "simulated email to"
  destinations ||--o{ activities : has
  destinations ||--o{ hotels : has
  destinations ||--|| advisories : "has dataset advisory"
  destinations ||--o| advisory_overrides : "may have override"
  destinations ||--o{ featured_content : "featured as"
  destinations ||--o{ trips : "is visited in"
  airports ||--o{ flights : "departs from"
  airports ||--o{ flights : "arrives at"
  airports ||--o{ destinations : "served by"
  hotels ||--o{ room_types : offers
  trips ||--o{ itinerary_items : contains
  bookings ||--o| itinerary_items : "shown as"
  bookings ||--o| flight_bookings : "flight detail"
  bookings ||--o| hotel_bookings : "hotel detail"
  bookings ||--o{ payments : "charged and refunded by"
  flights ||--o{ flight_bookings : "booked as"
  room_types ||--o{ hotel_bookings : "booked as"
  notifications ||--o| email_outbox : "mirrored by"

  users {
    int id PK
    string email UK
    string password_hash
    string name
    string role "user or admin"
    string home_airport
    string temp_unit "F or C"
    text_arr interests
    timestamptz created_at
  }
  destinations {
    int id PK
    string slug UK
    string name
    string country
    string region
    text description
    string image_url "local sample art"
    numeric avg_daily_cost
    int budget_tier "1 to 4, derived from cost"
    text_arr interests
    numeric latitude
    numeric longitude
    string airport_code FK
  }
  activities {
    int id PK
    int destination_id FK
    string name
    string category
    text description
    int duration_min
  }
  airports {
    string code PK
    string city
    string country
    boolean is_origin "selectable departure city"
  }
  flights {
    int id PK
    string flight_no
    string airline
    string origin_code FK
    string dest_code FK
    timestamptz depart_at
    timestamptz arrive_at
    numeric price "per passenger"
    int seats_available
    int stops
    string status "on_time, delayed, cancelled"
  }
  hotels {
    int id PK
    int destination_id FK
    string name
    numeric rating
    text_arr amenities
    string address
    string image_url
  }
  room_types {
    int id PK
    int hotel_id FK
    string name
    int capacity
    numeric nightly_price
    int rooms_total
  }
  advisories {
    int destination_id PK
    int level "1 to 4"
    string summary
    text_arr categories
    string source_label "Illustrative sample"
  }
  advisory_overrides {
    int destination_id PK
    int level "1 to 4"
    string note
    int admin_id FK
    timestamptz created_at
  }
  featured_content {
    int id PK
    int destination_id FK
    string headline
    int position
    boolean active
  }
  trips {
    int id PK
    int user_id FK
    int destination_id FK
    string name
    date start_date
    date end_date
    timestamptz created_at
  }
  itinerary_items {
    int id PK
    int trip_id FK
    string kind "flight, hotel, activity, note"
    string title
    date day
    time start_time "optional"
    int position "order within the day"
    int activity_id FK "optional"
    int booking_id FK "optional"
    int flight_id FK "optional"
    int hotel_id FK "optional"
    string notes "optional"
  }
  bookings {
    int id PK
    int user_id FK
    string kind "flight or hotel"
    string reference UK
    string status "confirmed or cancelled"
    numeric total
    numeric refunded
    timestamptz created_at
    timestamptz cancelled_at
  }
  flight_bookings {
    int booking_id PK
    int flight_id FK
    int return_flight_id FK "optional"
    jsonb passengers "names and dates of birth"
  }
  hotel_bookings {
    int booking_id PK
    int room_type_id FK
    date check_in
    date check_out
    int guests
    string guest_name
  }
  payments {
    int id PK
    int booking_id FK
    string kind "charge or refund"
    string status "approved or declined"
    numeric amount
    string card_brand
    string card_last4
    string receipt_number UK
    timestamptz created_at
  }
  payment_methods {
    int id PK
    int user_id FK
    string brand
    string last4
    string nickname
    boolean is_default
  }
  notifications {
    int id PK
    int user_id FK
    string type "booking, weather, advisory, delay, change, cancellation"
    string title
    text body
    string dedupe_key "unique per user"
    timestamptz read_at
    timestamptz created_at
  }
  email_outbox {
    int id PK
    int user_id FK
    int notification_id FK
    string to_email
    string subject
    text body
    timestamptz created_at
  }
  api_health_checks {
    int id PK
    string service "weather or database"
    boolean ok
    int latency_ms
    string error
    timestamptz checked_at
  }
```

Notes:

- `text_arr` in the diagram means a Postgres `text[]` column.
- **Card data:** there are no PAN, CVC or expiry columns anywhere; `payments` and `payment_methods` hold brand and last4 only (hard rule).
- **Effective advisory** = override if present, else dataset row; the dataset row is never modified, so removing an override restores the original.
- **Availability:** flights decrement `seats_available` on booking and restore it on cancel; room availability is `rooms_total` minus overlapping confirmed hotel bookings for the requested dates.
- **Itinerary order:** `(trip_id, day, position)`; reorder rewrites positions for the affected days in one transaction.
- `api_health_checks` is append-only; the admin page shows the latest row per service.
- The weather cache is in server memory (10 minutes, per destination); it is not persisted.

## 5. API surface

All paths are under `/api`. Auth: P = public, U = signed-in user, A = admin.

| Method and path | Auth | Story |
| --- | --- | --- |
| GET `/health` | P | TECH-01 |
| GET `/destinations?q=&region=&budget=&interest=` | P | SCRUM-11, 12 |
| GET `/destinations/filters` (regions, interests, tiers) | P | SCRUM-12 |
| GET `/destinations/:slug` (details, activities, images) | P | SCRUM-13 |
| GET `/destinations/:slug/weather` | P | SCRUM-14 |
| GET `/destinations/:slug/advisory` (effective advisory) | P | SCRUM-15 |
| GET `/advisories?q=&level=&region=&category=` | P | SCRUM-39 |
| GET `/featured` | P | SCRUM-42 |
| GET `/flights?origin=&destination=&depart=&return=&maxPrice=&sort=` | P | SCRUM-21 |
| GET `/hotels?destination=&checkIn=&checkOut=&guests=&minPrice=&maxPrice=&minRating=&amenity=` | P | SCRUM-23 |
| GET `/hotels/:id` (room types with availability and total) | P | SCRUM-24 |
| POST `/auth/register`, `/auth/login`, `/auth/logout` | P | SCRUM-34 |
| GET `/me`, PATCH `/me` (profile and preferences) | U | SCRUM-34 |
| GET, POST `/me/payment-methods`; PATCH, DELETE `/me/payment-methods/:id` | U | SCRUM-43 |
| POST `/bookings/quote` (server-computed price) | U | SCRUM-22, 24 |
| POST `/bookings` (create, pay, confirm) | U | SCRUM-22, 24, 25, 27 |
| GET `/bookings?sort=&status=` | U | SCRUM-26 |
| GET `/bookings/:id` (detail and receipt) | U | SCRUM-25, 26 |
| PATCH `/bookings/:id` (modify) | U | SCRUM-26 |
| POST `/bookings/:id/cancel` | U | SCRUM-37 |
| GET, POST `/trips`; GET, PATCH, DELETE `/trips/:id` | U | SCRUM-31 |
| GET `/trips?scope=past` | U | SCRUM-35 |
| POST `/trips/:id/items`; PATCH, DELETE `/trips/:id/items/:itemId` | U | SCRUM-31, 32 |
| PUT `/trips/:id/order` (reorder within and across days) | U | SCRUM-36 |
| GET `/notifications`; POST `/notifications/:id/read`, `/notifications/read-all` | U | SCRUM-27, 33 |
| POST `/alerts/scan` | U | SCRUM-33 |
| GET `/admin/api-status`; POST `/admin/api-status/check` | A | SCRUM-40 |
| PUT, DELETE `/admin/advisories/:destinationId/override` | A | SCRUM-41 |
| GET, POST `/admin/featured`; PATCH, DELETE `/admin/featured/:id` | A | SCRUM-42 |
| PATCH `/admin/flights/:id/status` (simulate delay or cancellation) | A | SCRUM-33 |

PDF export (SCRUM-38) has no endpoint: the client renders it from `GET /trips/:id`.

## 6. Main flows

### 6.1 Search (destinations, flights, hotels)

```mermaid
sequenceDiagram
  actor T as Traveler
  participant C as Vue client
  participant S as Fastify
  participant D as Postgres
  T->>C: types keyword, sets filters
  C->>C: debounce 300 ms
  C->>S: GET /api/destinations?q=tokyo&region=Asia
  S->>D: parameterised SELECT (ILIKE + filters)
  D-->>S: rows
  S-->>C: destinations
  T->>C: opens a destination
  par details, weather, advisory
    C->>S: GET /destinations/:slug
    C->>S: GET /destinations/:slug/weather
    C->>S: GET /destinations/:slug/advisory
  end
  T->>C: searches flights / hotels with dates
  C->>S: GET /flights or /hotels (with constraints)
  S->>D: SELECT with seat and room availability
  S-->>C: results sorted/filtered, prices from DB
```

### 6.2 Book and pay

```mermaid
sequenceDiagram
  actor T as Traveler
  participant C as Vue client
  participant S as Fastify
  participant D as Postgres
  T->>C: selects a flight or room, enters traveler details
  C->>S: POST /bookings/quote
  S->>D: read prices and availability
  S-->>C: total computed server-side
  T->>C: enters card (number, expiry, CVC, name)
  C->>C: client-side format and brand hint only
  C->>S: POST /bookings {item, passengers, card}
  S->>S: validate card: Luhn, brand, expiry, CVC
  alt card invalid
    S-->>C: 422 error with field messages, nothing stored
  else mock processor declines (test card ...0002)
    S->>D: insert payment (declined, brand, last4)
    S-->>C: 402 card_declined, no booking created
  else approved
    S->>D: BEGIN: lock flight or room, check availability
    S->>D: insert booking, detail, payment (approved), notification, email_outbox
    S->>D: COMMIT
    S-->>C: 201 booking reference and receipt number
  end
```

The card number and CVC exist only in the request body and are neither persisted nor logged (Fastify redaction on those fields).

### 6.3 Itinerary

```mermaid
sequenceDiagram
  actor T as Traveler
  participant C as Vue client
  participant S as Fastify
  participant D as Postgres
  T->>C: creates trip (destination, dates)
  C->>S: POST /trips
  T->>C: adds flight/hotel selection or custom activity ("Shibuya, 1:00 pm")
  C->>S: POST /trips/:id/items
  S->>D: insert item (day, time, position)
  T->>C: moves an item (drag, or Move up/down/to-day buttons)
  C->>C: reorder() pure function gives new order
  C->>S: PUT /trips/:id/order
  S->>D: BEGIN, rewrite positions, COMMIT
  T->>C: Export PDF
  C->>S: GET /trips/:id
  C->>C: buildItineraryDocument() then render PDF
```

### 6.4 Alerts

```mermaid
sequenceDiagram
  actor T as Traveler
  participant C as Vue client
  participant S as Fastify
  participant D as Postgres
  participant W as Open-Meteo
  T->>C: signs in or clicks "Check my trips"
  C->>S: POST /alerts/scan
  S->>D: upcoming trips and confirmed bookings
  loop each trip destination
    S->>W: forecast (cached, 5 s timeout)
    W-->>S: forecast or failure
    S->>S: alert rules (severe weather, advisory level, flight status)
  end
  S->>D: insert notifications and email_outbox rows (dedupe_key avoids repeats)
  S-->>C: new notifications
  Note over S,W: if the weather API fails, weather alerts are skipped and the scan still succeeds
```

## 7. Key rules (kept in one place so they are easy to review)

| Rule | Value | Lives in |
| --- | --- | --- |
| Flight total | fare x passengers, plus 7.5% taxes and fees | `lib/pricing.ts` |
| Hotel total | nightly rate x nights x rooms, plus 12% tax | `lib/pricing.ts` |
| Nights | check-out minus check-in; a stay must be 1 to 30 nights | `lib/dates.ts`, `lib/hotels.ts` |
| Refund | 100% at 7 or more days before departure/check-in; 50% from 2 to under 7 days; 0% under 2 days (assumption G-12) | `lib/refunds.ts` |
| Card brands | Visa 4; Mastercard 51-55 and 2221-2720; Amex 34, 37; Discover 6011, 65, 644-649 | `lib/cards.ts` |
| Mock decline | card `4000 0000 0000 0002` | `lib/payments.ts` |
| Weather cache | 10 minutes per destination; 5 s upstream timeout | `lib/weather.ts` |
| Advisory levels | 1 Normal precautions, 2 Increased caution, 3 Reconsider travel, 4 Do not travel (illustrative wording, not an official scale) | `lib/advisory.ts` |
| Severe weather | WMO codes for thunderstorm, heavy rain, heavy snow or freezing rain, or wind above 60 km/h | `lib/alerts.ts` |

All values are my assumptions and are listed in [backlog.md](backlog.md) section 8 where they need approval.

## 8. Test architecture

- **Unit tests:** `server/test/unit` and colocated `client/src/**/*.test.ts`. No DB, no network: `fetch` and timers are faked, and DB access goes through a mocked `Queryable`.
- **Integration tests:** `server/test/integration` run Fastify via `inject()` against the real Postgres `wayfarer_test` database. Files run serially, each test creates its own data (unique emails) and asserts tolerantly because the database accumulates rows (risk R-05).
- **Component tests:** Vue Test Utils with jsdom for the advisory banner, weather panel states, checkout error/busy states and search debounce.
- **Coverage gate:** 90% lines on server `lib/` and client `utils/` and `api/` (enforced by Vitest thresholds in CI); overall coverage is reported per sprint. Details go in `docs/test-strategy.md` when the first story lands.
- **Manual:** browser smoke test in Phase 3 (search, checkout with a declined card, drag-and-drop, PDF, cancellation, advisories, admin).

## 9. Dependencies and why

| Package | Where | Reason |
| --- | --- | --- |
| fastify, @fastify/postgres, pg | server | Fixed stack. |
| @fastify/cookie, @fastify/jwt | server, **added with SCRUM-34** | httpOnly cookie sessions; avoids hand-rolling token signing. |
| vue, vue-router | client | Fixed stack. |
| pinia | client, **added with SCRUM-34** | Standard Vue store; the brief asks for tested stores. |
| a client-side PDF library (jsPDF, to be confirmed) | client, **added with SCRUM-38** | Avoids server-side rendering; the document model stays library-independent. |
| vite, @vitejs/plugin-vue, vue-tsc | client dev | Build and type-check `.vue` files. |
| vitest, @vitest/coverage-v8, @vue/test-utils, jsdom | dev | Fixed test stack. |
| tsx | server dev | Runs TypeScript for `dev` and `db:init`. |
| eslint, typescript-eslint, eslint-plugin-vue, eslint-config-prettier, prettier | root dev | Lint and format. |
| concurrently | root dev | `npm run dev` starts client and server together. |
| typescript pinned to 6.0.x | dev | typescript-eslint does not yet support TypeScript 7. |

Native HTML5 drag and drop is used for reordering (no library). Dependencies added later will be called out in the story's PR description.

## 10. Decisions and deviations

| Decision | Why |
| --- | --- |
| Postgres seed SQL instead of local JSON (ConOps 3.2.1) | `CLAUDE.md` fixes the stack; gap G-05. |
| No background scheduler for alerts | Deterministic and testable; gap G-08. |
| Simulated email via table | No mail provider; gap G-07. |
| Server build uses `module: NodeNext` (imports end in `.js`) | `tsc` output runs on plain Node with no bundler. |
| API types mirrored, not shared | Layout fixed by `CLAUDE.md`; contract tests guard drift. |
