# Wayfarer Product Backlog

Source of truth: [project-docs.txt](project-docs.txt) (Vision, ConOps, UC-01..UC-10, SCRUM-11..SCRUM-35). Acceptance criteria (AC) below are copied verbatim from that file. Anything I added or split is marked **Derived** and traces to the ConOps/UC section that motivates it.

**Status vocabulary:** To Do · In Progress · In Review (built and verified, awaiting PM review and commit) · Done (merged) · Descoped
**Priority (MoSCoW):** Must · Should · Could
**Points:** 1, 2, 3, 5, 8 (relative; calibrated after Sprint 1, see [sprint-plan.md](sprint-plan.md))

> **Scope note (2026-10-22):** Sprint 1 as built is the ConOps 5.1 MVP: destination search and filtering, flight and hotel search with selection, a basic itinerary builder, the weather popup, advisories, and user accounts (register, sign in). Booking, payment, profile and notifications were removed at the PM's request (see the re-scoping log). A second pass the same day removed the travel advisory banner (SCRUM-15) and itinerary item editing, so Sprint 1 matches ConOps 5.1 exactly.

## 1. Summary

| Sprint | Stories | Points | Notes |
| --- | --- | --- | --- |
| 0 (planning/skeleton) | 1 | 3 | TECH-01, not counted in velocity |
| 1 (MVP, ConOps 5.1 + pulled-in booking/account stories) | 15 | 52 | |
| 2 (expansion, ConOps 5.2 + remaining stories) | 11 | 38 | |
| **Total delivered scope** | **27** | **93** | 90 points counted in velocity |

Story IDs missing from the source numbering (SCRUM-16..20, SCRUM-28..30) are not in the docs; I treat them as out of scope (see gap G-01).

## 2. Traceability seed (use case to stories)

| Use case | Stories |
| --- | --- |
| UC-01 Search Destinations | SCRUM-11, 12, 13 |
| UC-02 Manage Flights | SCRUM-21, 22 |
| UC-03 Manage Hotels | SCRUM-23, 24 |
| UC-04 Create an Itinerary | SCRUM-31, 32, 36, 38 |
| UC-05 Destination Weather | SCRUM-14 |
| UC-06 Travel Restrictions/Advisories | SCRUM-15, 39, 41 |
| UC-07 Manage Booking | SCRUM-26, 37 (and Admin: SCRUM-40) |
| UC-08 Make Travel Payments | SCRUM-25, 27 |
| UC-09 Travel Notifications | SCRUM-27, 33 |
| UC-10 Manage User Profile | SCRUM-34, 35, 43 |
| ConOps 2.2 Admin persona | SCRUM-40, 41, 42 |

## 3. Epic 0: Enablers (Derived)

| ID | Title | Pts | Priority | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| TECH-01 | Project skeleton, tooling, CI, planning docs | 3 | Must | 0 | In Review |
| TECH-02 | Database schema and sample seed data | 3 | Must | 1 | In Review |

**TECH-01 (Derived)**: Monorepo, strict TypeScript, Vitest, lint/format, Docker Compose Postgres 16, root scripts, CI with Postgres service. *AC (mine):* `typecheck`, `lint`, `test`, `build` pass on a clean checkout; CI runs the same steps against a Postgres service.

**TECH-02 (Derived)**: `db/schema.sql` and `db/seed.sql` implementing [architecture.md](architecture.md) section 4, with destinations, activities, airports, flights (generated relative to `CURRENT_DATE`), hotels, room types and illustrative advisories, all labelled as sample data. `pg` type parsers (numeric to number, date to `YYYY-MM-DD`). *AC (mine):* `npm run db:init` is repeatable; seed has at least 12 destinations, flights for the next 90 days on every seeded route, 2+ hotels per destination, and an advisory for every destination; unit test for the type parsers.

## 4. Epic 1: Trip Search and Discovery

| ID | Title | UC | Pts | Priority | Sprint | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SCRUM-11 | Search Destinations by Keyword | UC-01 | 2 | Must | 1 | In Review |
| SCRUM-12 | Filter Destinations | UC-01 | 3 | Must | 1 | In Review |
| SCRUM-13 | View Destination Details | UC-01 | 3 | Must | 1 | In Review |
| SCRUM-14 | View Weather | UC-05 | 5 | Must | 1 | In Review |
| SCRUM-15 | View Travel Restrictions | UC-06 | 3 | Must | 1 | In Review |

**SCRUM-11: Search Destinations by Keyword.** As a traveler, I want to search destinations by keyword so I can explore trip options.
*AC:* Given a keyword, the system returns matching destinations.
*Planned tests:* matches name, country and region case-insensitively; no match shows an empty state; empty keyword lists all; client search input is debounced (unit).

**SCRUM-12: Filter Destinations.** As a traveler, I want to filter destinations by budget, region, or interests so the results match what I want.
*AC:* User can apply or remove filters and results update accordingly.
*Planned tests:* each filter alone and combined; removing a filter restores results; filters combine with the keyword (AND). See G-09 for what "budget" means.

**SCRUM-13: View Destination Details.** As a traveler, I want to view destination photos, description, and activities so I can decide where and how to plan my trip.
*AC:* Selecting a destination shows a description, brief list of activities, and photos.
*Planned tests:* detail endpoint returns description, at least 3 activities, at least 1 image; unknown slug returns 404; photos are locally hosted sample art (G-10).

**SCRUM-14: View Weather.** As a traveler, I want to view weather for a destination so I can plan my trip appropriately.
*AC:* The user can view a weather panel for the selected destination.
*Scope:* Open-Meteo current conditions plus 5-day forecast, 10-minute server cache, graceful error state; shown as a popup from the weather badge (ConOps 5.1) and as an inline panel on the destination page (G-03).
*Planned tests:* WMO code mapping to label/icon; cache hit/expiry with fake timers; fetch failure and timeout return an "unavailable" payload, not a 500; panel loading/error/success states; fake `fetch` everywhere (no network in tests).

**SCRUM-15: View Travel Restrictions.** As a traveler, I want to view travel advisories and restrictions so I can plan accordingly.
*AC:* The selected destination shows any relevant travel advisories or restrictions sourced from official government data.
*Scope:* advisory banner (levels 1-4) for the destination's country from the **U.S. Department of State** travel-advisory feed (`cadataapi.state.gov`), cached for 6 hours, with a source line and a link to the full advisory. If the feed cannot be reached, a made-up **sample** advisory from the seed data is shown, clearly labelled as sample data. The State Department issues none for the United States, so US destinations show a note instead. Gap G-02 resolved by PM (2026-10-29): use the US Department of State feed.
*Planned tests:* level to label/colour mapping; banner renders each level; override beats dataset value (the override itself is built in SCRUM-41); label always visible.

## 5. Epic 2: Booking and Payment System

| ID | Title | UC | Pts | Priority | Sprint | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SCRUM-21 | Search Flights | UC-02 | 3 | Must | 1 | In Review |
| SCRUM-22 | Book Flight | UC-02 | 5 | Must | 1 | Descoped |
| SCRUM-23 | Search hotels | UC-03 | 3 | Must | 1 | In Review |
| SCRUM-24 | Book Hotel | UC-03 | 3 | Must | 1 | Descoped |
| SCRUM-25 | Make Payment | UC-08 | 5 | Must | 1 | Descoped (a trip-level fake payment was later added by a teammate, PR #1; not yet reviewed against SCRUM-25's AC) |
| SCRUM-27 | Booking Confirmation | UC-08, UC-09 | 2 | Must | 1 | Descoped |
| SCRUM-26 | Manage Bookings | UC-07 | 5 | Must | 2 | In Review |
| SCRUM-37 | Cancel a booking with refund (**Derived**) | UC-07 | 3 | Must | 2 | To Do |

**SCRUM-21: Search Flights.** As a traveler, I want to search flights by date and destination so I can compare options.
*AC:* User enters origin/destination and departure/return dates, and the system returns a list of flights meeting those constraints.
*Planned tests:* one-way and round trip (G-11); date window; sort by price/duration and filter by max price (ConOps 4.1: price, ratings, dates); no result state; flights with no seats are excluded.

**SCRUM-22: Book Flight.** As a traveler, I want to book a flight so I can confirm travel for my trip.
*AC:* User can select a flight, enter passenger info, and successfully book the flight.
*Planned tests:* success path decrements seats; validation of passenger fields; sold-out flight rejected; requires login (G-04); price comes from the DB, a client-sent amount is ignored.

**SCRUM-23: Search hotels.** As a traveler, I want to search hotels by destination and date so I can find a good accommodation for my trip.
*AC:* User can select location and date, and the system returns a list of accommodations within those constraints.
*Planned tests:* check-out after check-in; nights calculation; price range, rating and amenity filters (UC-03); unavailable room types hidden.

**SCRUM-24: Book Hotel.** As a traveler, I want to book a hotel so I can confirm my accommodation for a destination.
*AC:* User selects room type, location, dates, and enters guest details, and booking is confirmed.
*Planned tests:* total = nightly rate x nights x rooms + tax, computed server-side; overlapping bookings respect `rooms_total`; invalid dates rejected.

**SCRUM-25: Make Payment.** As a traveler, I want to pay for my travel so I can securely complete my purchase.
*AC:* User selects payment method, enters payment info, the transaction is securely processed, and the user is given a receipt.
*Scope:* mocked processor (G-06). Luhn check, brand detection, expiry and CVC validation; test card for decline; only brand + last4 stored; receipt number.
*Planned tests:* valid/invalid Luhn per brand; expired card rejected; declined card leaves no booking and a "declined" payment row; no PAN/CVC in DB or logs; checkout UI busy and error states.

**SCRUM-27: Booking Confirmation.** As a traveler, I want to receive confirmation that my booking has been processed so I have proof of my flight/hotel accommodation.
*AC:* The system sends a notification or email upon the customer successfully booking.
*Scope:* in-app notification plus a simulated email written to `email_outbox` (G-07); confirmation page with receipt.
*Planned tests:* successful booking creates exactly one notification and one outbox row; declined payment creates none.

**SCRUM-26: Manage Bookings.** As a traveler, I want to view and manage my bookings so I can modify or cancel them for any reason.
*AC:* The user can view a sortable list of all of their current bookings and modify them.
*Scope:* list, sort by date/price/status, modify (G-12). Cancellation is split to SCRUM-37 because the AC text only covers view and modify while the story text also says cancel.
*Planned tests:* sorting; user sees only their own bookings (authorisation); hotel date change reprices with delta; passenger-name correction on a flight; cancelled booking cannot be modified.

**SCRUM-37 (Derived): Cancel a booking with refund.** From SCRUM-26 story text ("modify or cancel") and UC-07. *AC (mine):* a cancelled booking is marked cancelled, a refund is calculated by the cancellation policy (G-12) and recorded as a refund payment, seats/rooms are released, and a cancellation notification is created.
*Planned tests:* refund tiers at the boundaries (mocked DB client unit test); double-cancel rejected; integration test for cancel with refund.

## 6. Epic 3: Itinerary and Account Management

| ID | Title | UC | Pts | Priority | Sprint | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SCRUM-31 | Create Itinerary | UC-04 | 5 | Must | 1 | In Review |
| SCRUM-32 | Edit itinerary (add, edit, remove, move up/down) | UC-04 | 2 | Must | 1 | In Review |
| SCRUM-34 | Manage Profile (Sprint 1: register, sign in and out only) | UC-10 | 5 | Must | 1 | In Review |
| SCRUM-36 | Reorder itinerary: drag and drop + keyboard (**Derived**) | UC-04 | 5 | Must | 2 | To Do |
| SCRUM-38 | Export itinerary to PDF (**Derived**) | UC-04 | 3 | Must | 2 | To Do |
| SCRUM-33 | Receive alerts | UC-09 | 5 | Should | 2 | In Review |
| SCRUM-35 | View Past Trips | UC-10 | 2 | Should | 2 | In Review |
| SCRUM-43 | Saved payment methods (**Derived**) | UC-10 | 3 | Could | 2 | To Do |

**SCRUM-31: Create Itinerary.** As a traveler, I want to create a personalized itinerary so I can plan my trip by the day.
*AC:* The user can add destinations and activities in those destinations to a daily itinerary and save and track it in the system.
*Scope:* a trip has a destination and date range; days are derived from the dates. Flight and hotel selections added to the trip appear on the right days automatically (ConOps 4.1); custom activities have an optional time ("Visit Shibuya at 1:00 pm"); a summary view; persisted server-side.
*Planned tests:* day derivation and ordering (pure function); selection lands on the correct day; custom activity with and without time; trip belongs to its owner; summary totals.

**SCRUM-32: Edit itinerary.** As a traveler, I want to edit my itinerary so I can adjust my plans.
*AC:* User can add, remove, or rearrange itinerary items.
*Scope split:* add/remove in Sprint 1 (ConOps 5.1 "add or remove activities and saved items"); **rearrange moves to SCRUM-36 in Sprint 2** (ConOps 5.2). This is a re-scoping of one AC clause, recorded here.
*Planned tests:* add and remove each item kind; remove is owner-only; edit time/notes.

**SCRUM-36 (Derived): Reorder itinerary with drag and drop.** From ConOps 5.2 and the "rearrange" clause of SCRUM-32. *AC (mine):* items can be reordered within a day and moved between days by drag and drop **and** by keyboard-accessible "move up/down/to day" buttons; order persists after reload.
*Planned tests:* pure `reorder` function (within day, across days, out-of-range, no-op); `PUT /trips/:id/order` persists and validates; component test for the move buttons.

**SCRUM-38 (Derived): Export itinerary to PDF.** From ConOps 5.2. *AC (mine):* a trip can be exported as a PDF with its days, items, times and booking references.
*Planned tests:* pure `buildItineraryDocument` (data to document model) is unit tested; PDF rendering smoke test produces a non-empty `%PDF` blob; manual check in browser.

**SCRUM-33: Receive alerts.** As a traveler, I want to receive alerts on any travel delays, restrictions, or inclement weather so I can stay informed on my travel.
*AC:* The system sends an email/notification upon discovery of inclement weather, travel delay, or travel restriction.
*Scope:* in-app notification centre plus simulated email (G-07). Alerts are generated by an on-demand scan (no background scheduler, G-08) of the user's upcoming trips: severe weather codes in the forecast, advisory level 3-4 or a changed level, and flight status delayed/cancelled (set by an admin, SCRUM-40).
*Planned tests:* scan rules (pure); dedupe so repeated scans do not duplicate alerts; mark read; weather API down means no weather alerts, not a failure.

**SCRUM-34: Manage Profile.** As a traveler, I want to create and manage my profile so that the system knows my preferences and history.
*AC:* User can register for an account, update personal preferences and information, and save those changes to their user account.
*Scope:* register, login/logout, profile (name, home airport, preferred units, interests). Roles `user` and `admin`. History is delivered by SCRUM-35. Saved payment methods split to SCRUM-43.
*Planned tests:* scrypt hash/verify; duplicate email rejected; wrong password; route guards (client) and auth hook (server); profile update persists.

**SCRUM-35: View Past Trips.** As a traveler, I want to view my past trips so I can reference them.
*AC:* The user can view a list of previous bookings and trips created with the system.
*Scope:* "past" means the trip or booking end date is before today (G-13); cancelled bookings are shown with their status.
*Planned tests:* past/upcoming split at the date boundary (pure); owner-only.

**SCRUM-43 (Derived): Saved payment methods.** From UC-10 ("payment methods"). *AC (mine):* a user can save, list, set default and delete payment methods; only brand, last4 and a nickname are stored; the checkout can use a saved method (CVC is always re-entered and never stored).
*Planned tests:* saving never persists PAN/CVC (schema and payload test); default switching; delete.

## 7. Epic 4: Travel Advisories and Administration (Derived)

The ConOps names an admin persona (2.2) and a "filtered travel restriction search bar" (5.2) but the story list has no matching stories, so these are new IDs for Jira to adopt or rename.

| ID | Title | UC | Pts | Priority | Sprint | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SCRUM-39 | Filtered travel-restriction search | UC-06 | 3 | Must | 2 | To Do |
| SCRUM-40 | Admin: monitor API status | UC-07, ConOps 2.2 | 3 | Should | 2 | To Do |
| SCRUM-41 | Admin: override an advisory | UC-06, ConOps 2.2 | 3 | Should | 2 | To Do |
| SCRUM-42 | Admin: manage featured content | ConOps 2.2 | 3 | Should | 2 | To Do |

**SCRUM-39 (Derived): Filtered travel-restriction search.** From ConOps 5.2. *AC (mine):* a page lists advisories with a text search by destination/country and filters for level (1-4), region and category; filters can be removed and results update.
*Planned tests:* filter combinations (pure); API query integration test; empty state.

**SCRUM-40 (Derived): Admin: monitor API status.** From ConOps 2.2 ("monitor API connections"). *AC (mine):* an admin sees the status, last-checked time and latency of the weather API and the database, can trigger a re-check, and non-admins get 403.
*Planned tests:* status shaping and timeout handling with a fake `fetch`; authorisation; integration test.

**SCRUM-41 (Derived): Admin: override an advisory.** From ConOps 2.2 ("override travel restriction alerts if they show errors"). *AC (mine):* an admin can set an override level and note for a destination and remove it; the override wins over the seeded value everywhere it is shown, is labelled "overridden by admin", and the original value is kept.
*Planned tests:* effective-advisory resolution (pure); override and revert via API; non-admin 403.

**SCRUM-42 (Derived): Admin: manage featured content.** From ConOps 2.2 ("manage featured content"). *AC (mine):* an admin can add, reorder, activate/deactivate and delete featured destinations shown on the home page.
*Planned tests:* CRUD integration test; ordering; inactive items hidden from the public list.

## 8. Gaps and ambiguities in the source docs

Each needs your decision or a veto. "Proposed" is what I will implement if you approve the plan unchanged.

| # | Gap or ambiguity | Where | Proposed resolution |
| --- | --- | --- | --- |
| G-01 | Story numbering skips SCRUM-16..20 and SCRUM-28..30; epics have no Jira IDs. | Stories | Treat as non-existent (deleted, bugs or other-epic work). Derived stories use SCRUM-36+ and TECH-nn; rename to your real Jira keys if they exist. |
| G-02 | SCRUM-15 requires advisories "sourced from official government data"; ConOps 3.2.3 says a local structured dataset; CLAUDE.md forbids presenting them as official. | SCRUM-15, ConOps 3.2.3 | Docs conflict internally. Use the seeded dataset, labelled "Illustrative sample data, not official guidance", with a pointer to check official sources. Reword the AC accordingly. **Needs approval.** |
| G-03 | "Real-time" / "live" weather (Vision, UC-05) vs. a free API; "weather popup" (ConOps 5.1) vs. "weather panel" (SCRUM-14). | Vision, UC-05 | Open-Meteo gives current conditions and forecasts, not guaranteed real time: show "as of HH:MM" and cache 10 minutes. One component serves both: popup from the badge and inline panel. Unit default is deg F (ConOps example "72 F"), changeable in the profile. |
| G-04 | Guest vs registered: UC-02/03/08 name "Web User", UC-04/09/10 "Registered User". Can a guest check out? | Use cases | Guests can search, view details, weather and advisories (UC-01/05/06). Booking, payment, itineraries and notifications require an account. No guest checkout, so bookings always have an owner. **Needs approval.** |
| G-05 | ConOps 3.1/3.2.1 imply a browser-only app with local JSON; CLAUDE.md fixes Fastify + PostgreSQL. | ConOps 3.1, 3.2.1 | Follow CLAUDE.md. "Local JSON datasets / mock API stubs" is implemented as seed SQL in Postgres. Deviation documented in the architecture doc. |
| G-06 | "Securely processed" payment (SCRUM-25) with no processor chosen. | SCRUM-25 | Mock processor in `lib/`: Luhn, brand, expiry, CVC; test card `4000 0000 0000 0002` is declined. Store brand + last4 only. UI labels payments as simulated. |
| G-07 | "notification or email" (SCRUM-27) and "email/notification" (SCRUM-33), with no mail provider. | SCRUM-27, 33 | In-app notification centre is the real channel. "Email" is simulated by rows in `email_outbox` (visible to admins/dev), not sent. |
| G-08 | SCRUM-33 says the system "sends" alerts upon "discovery"; no scheduler or flight-status feed exists. | SCRUM-33 | On-demand scan (at login and via a "check my trips" button) keeps it deterministic and testable. Flight delays come from `flights.status`, which an admin can change. No cron. |
| G-09 | SCRUM-12 filters by "budget" without defining it; UC-01 also mentions travel dates as a filter. | SCRUM-12, UC-01 | Budget = four price tiers from the destination's seeded average daily cost. Travel dates apply to flight/hotel search, not to destination filtering. |
| G-10 | SCRUM-13 requires photos; no image source or licence is given. | SCRUM-13 | Ship locally hosted illustrative artwork (generated SVG) as sample images. No hotlinking, no licence risk. Real photos can replace them later. |
| G-11 | SCRUM-21 asks for return dates but doesn't say whether one-way is allowed. | SCRUM-21 | Return date optional: one-way and round trip. A round trip books as one booking with two legs. Flights are seeded for the next 90 days relative to the current date. |
| G-12 | SCRUM-26 "modify" and "cancel" are undefined; no refund policy exists. | SCRUM-26, UC-07 | Modify: hotel dates/guests (repriced, difference charged or refunded) and flight passenger-name corrections (date changes mean cancel and rebook). Refund: 100% if 7+ days before departure/check-in, 50% from 2 to under 7 days, 0% under 2 days. Assumption, easy to change in one constant. |
| G-13 | SCRUM-35 "previous bookings and trips": past-dated only, or all history? | SCRUM-35 | Past = end date before today. Upcoming items stay in SCRUM-26/31. Cancelled bookings are shown, marked cancelled. |
| G-14 | Admin persona and "filtered travel restriction search" appear in ConOps but have no stories. | ConOps 2.2, 5.2 | Add SCRUM-39..42 (Derived). **Needs approval**, as these add 12 points. |
| G-15 | ConOps 2.3 says the executive stakeholder "evaluates project progress"; no feature is specified. | ConOps 2.3 | Treat as satisfied by project artefacts (sprint review, burndown, backlog), not an in-app dashboard. |
| G-16 | ConOps tracks work in Jira; this repo's CLAUDE.md requires `docs/backlog.md`. | ConOps 5.3, 6.1 | This file mirrors the Jira backlog; if both exist, Jira is authoritative for status and this file for acceptance criteria. Tell me if there is a Jira export to import. |
| G-17 | Minor: UC-10 title typo ("Manager User Profile"); success criteria promise "real-time weather alerts" (Vision/1.3) but ConOps 4.2 describes a badge, not alerts. | UC-10, 1.3 | Read as "Manage User Profile". Weather alerts delivered via SCRUM-33 (derived from forecast codes). |
| G-18 | UC-08 says payments for "flights, hotels, and other travel-related bookings"; only flights and hotels are bookable. | UC-08 | "Other" bookings (activities, insurance) out of scope. One booking = one payment; no multi-item cart. Documented limitation. |

## 9. Re-scoping log

| Date | Change | Reason |
| --- | --- | --- |
| 2026-10-21 | SCRUM-21..27 and SCRUM-34 pulled into Sprint 1 (ConOps 5.1 lists only search and selection). | Requested in the project brief so the MVP is coherent end to end. |
| 2026-10-21 | SCRUM-32 split: add/remove in Sprint 1, rearrange to SCRUM-36 in Sprint 2. | ConOps 5.1 vs 5.2. |
| 2026-10-21 | SCRUM-26 split: view/modify (SCRUM-26) and cancel with refund (SCRUM-37). | AC and story text disagree. |
| 2026-10-21 | SCRUM-34 split: payment methods to SCRUM-43. | Keeps the Sprint 1 account story small. |
| 2026-10-22 | **PM descoped from Sprint 1:** booking and payment (SCRUM-22, 24, 25, 27), profile management, and notifications. Code, tests, schema tables and routes for them were removed from the build. Flights and hotels are search-and-select only ("Add to trip"). SCRUM-34 keeps register, sign in and sign out. The half-built advisory override and the admin demo account were removed with them. | PM direction: Sprint 1 is the ConOps 5.1 MVP only. |
| 2026-10-22 | SCRUM-26, 33, 35, 37, 41, 43 (manage bookings, alerts, past trips, cancel, saved payment methods, advisory override) still depend on the removed booking and notification features and would need them rebuilt when scheduled. | Consequence of the descoping above. |
| 2026-10-22 | **Second descoping pass, to match ConOps 5.1 exactly:** removed the travel advisory banner, API and seed data (SCRUM-15, not in the 5.1 list), itinerary item editing (5.1 says add or remove) and the trip rename/date-change API. Kept: accounts, destination search and filters and details, flight and hotel search with Add to trip, add/remove itinerary builder (plus create, list and delete trip), weather popup and panel. | PM pasted ConOps 5.1 as the Sprint 1 definition. |
| 2026-10-29 | **PM approved SCRUM-32 (edit itinerary) and SCRUM-12 (filter destinations) for Sprint 1.** SCRUM-12 was never removed; it is in and covered by tests. SCRUM-32 now covers add, edit (title, day, time, notes), remove and rearrange with move up/down buttons within a day, which meets the story's "add, remove, or rearrange" criteria. Drag-and-drop reordering (SCRUM-36, ConOps 5.2) is still Sprint 2 and is not built. Trip rename and date changes are not built. | PM direction. |
| 2026-10-29 | **PM approved SCRUM-15 (view travel restrictions) back into Sprint 1.** Restored as a read-only advisory banner (levels 1 to 4) on each destination page, from the seeded sample dataset, always labelled "Illustrative sample data, not official guidance" (gap G-02). The admin override (SCRUM-41) and the restriction search (SCRUM-39) remain Sprint 2 and are not built. | PM direction. |
| 2026-11-07 | **PM approved SCRUM-35 (view past trips), SCRUM-26 (manage bookings) and SCRUM-33 (alerts).** Decisions: (1) *Past trips:* a trip is past when its end date is before today; the trips page splits into Upcoming and Past, and past trips cannot receive new flights or hotels (G-13). (2) *Bookings:* a booking is each flight or hotel item on a trip. Status is `planned` until the trip is paid (teammate's trip-level payment, PR #1), then `confirmed`. The bookings page lists them across all trips and sorts by date, price, trip, type or status. Modify = change hotel dates (repriced server-side) or remove a planned booking; flights are not re-dated; paid trips are locked. Cancel-with-refund (SCRUM-37) and refund policy (G-12) are still not built. (3) *Alerts:* severe weather in the 5-day forecast, a live State Department advisory at level 3 or 4, and delayed or cancelled flights (`flights.status`, seeded sample data). Delivered as in-app notifications plus a simulated email (`email_outbox` rows; nothing is sent). Checked on demand (once at sign-in, plus a "Check my trips for alerts" button), no background job (G-08); deduped per user. Sample advisories never raise alerts. Needs `npm run db:init` to pick up the new tables and demo trips. | PM direction. |
| 2026-10-29 | **SCRUM-15 now uses live U.S. Department of State data** instead of the made-up seed advisories (PM direction, resolves G-02). Source: `https://cadataapi.state.gov/api/TravelAdvisories` (no key; 218 countries; levels 1-4). Matched to destinations by country name because the feed's country codes are not ISO (for example `GB` is Gabon). Seeded advisories remain only as a labelled fallback. This satisfies "official government data" for US advisories only; the UI says the advice is for U.S. citizens and that Wayfarer is not an official source. | PM direction. |
