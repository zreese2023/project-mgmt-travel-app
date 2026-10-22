# Prompt for Claude Code: build Wayfarer from scratch

How to use: create an empty folder, copy this brief into it (`CLAUDE.md` at the root, `docs/` as is), `git init`, start Claude Code with `claude`, and paste everything below the line. Run it phase by phase if you want to review between sprints.

---

Read `CLAUDE.md` and `docs/project-docs.txt` first. Build the **Wayfarer travel & tourism booking app** from scratch in this folder, following the stack and working agreements in `CLAUDE.md` (Vue 3 + Vue Router + TypeScript front end, Fastify + TypeScript API, PostgreSQL, Vitest). There is no existing code; start clean.

This is a project-management class, so the way the work is organised and evidenced matters as much as the app. Plan before coding, work story by story on feature branches, and keep the paper trail up to date.

## Phase 0: Plan (no app code yet)

Produce, and show me for approval before continuing:

1. `docs/backlog.md`: every user story SCRUM-11 to SCRUM-35 and the Sprint 2 items from the ConOps, each with acceptance criteria copied from the docs, story points (1, 2, 3, 5, 8), priority, sprint (1 or 2) and status. Group by epic. Flag any gaps or ambiguities you find in the docs (for example: "real-time" weather vs. free API, "official government data" for advisories, guest vs. registered booking, email vs. in-app notifications) and propose a resolution for each.
2. `docs/sprint-plan.md`: two 2-week sprints, goals, committed stories, capacity assumptions, and a planned burndown (points remaining per day) so actuals can be compared later.
3. `docs/risks.md`: a risk register (likelihood, impact, mitigation, owner), including free-API dependency, sample-data limitations, scope creep, and test-database flakiness.
4. `docs/architecture.md`: components, data model (ER diagram in Mermaid), API surface, and the main flows (search, book and pay, itinerary, alerts).
5. The tooling skeleton only: monorepo layout, `tsconfig`s (strict), Vitest config, lint/format, `docker-compose.yml` for Postgres 16, root scripts (`setup`, `db:up`, `db:init`, `dev`, `typecheck`, `test`, `build`), and a CI workflow with a Postgres service container.

## Phase 1: Sprint 1 (MVP), per ConOps 5.1

Core destination search and filtering; basic flight and hotel search with selection; basic itinerary builder (add/remove activities and saved items); weather popup. Pull in the booking, payment and account stories (SCRUM-21 to SCRUM-27, SCRUM-34) as needed to make the MVP coherent, and record any re-scoping in the backlog.

For each story, on its own branch: write the failing tests from the acceptance criteria first, implement, make them pass, update `docs/backlog.md`, commit with the story ID. Merge to `main` only when type-check, tests and build are green.

Data: flights, hotels and destinations come from seed SQL (sample data, labelled as such in the UI). Weather comes from the free Open-Meteo API with a short cache and a graceful error state. Advisories come from a seeded dataset mapping destinations to levels 1 to 4 (label it illustrative, not official).

## Phase 2: Sprint 2 (backlog expansion), per ConOps 5.2

Itinerary drag-and-drop reordering (include keyboard-accessible move buttons), itinerary export to PDF, and a filtered travel-restriction search. Then the remaining stories: manage/modify/cancel bookings, notifications and alerts, past trips, profile and saved payment methods, and the admin persona (API status, advisory override, featured content).

## Testing requirements

- **Unit tests (no DB, no network)** for all business logic: card validation and brand detection, pricing and totals, date/night calculations, advisory shaping and override, weather mapping and caching (fake `fetch` and timers), itinerary ordering, booking cancel/refund logic (mocked DB client), and the front-end API client, stores, router guards and utilities. Components: advisory banner, weather panel (loading/error/success), checkout error and busy states, search debouncing. Extract pure logic (for example the drag-and-drop reorder function) into modules so it can be tested without simulating DOM events.
- **Integration tests** against a real Postgres for every API route: auth, search, booking with payment (success, decline, bad card), modify, cancel with refund, itinerary CRUD and reorder, alerts, and admin actions. Tests must tolerate leftover data.
- **Coverage:** at least 90% line coverage on server `lib/` and client `utils/` and `api` modules; report overall coverage per sprint.
- Name tests after the story they verify. Maintain `docs/test-strategy.md` with the test pyramid, a table of SCRUM story to tests, and an honest list of what is not covered.

## Phase 3: Verify and report

- Type-check both packages, run all tests with coverage, build the client, then run the app and click through the main flows in a browser (search, flights, checkout including a declined card, itinerary drag-and-drop, PDF export, cancellation, advisories, admin). Fix what you find.
- Write `README.md`: quick start, demo accounts, test commands, a traceability table (story to feature to tests), and the assumptions and known limitations.
- Write `docs/sprint-review.md` for each sprint: what was committed vs. delivered, actual vs. planned burndown, velocity, defects found, and lessons learned. Be honest about misses.

## Definition of done (per story)

Acceptance criteria met and tested; strict TypeScript with no unjustified `any`; unit and integration tests green; docs updated; reviewed and merged from a feature branch.

Stop after Phase 0 and wait for my approval of the plan. After that, continue through the phases, checking in at the end of each sprint.
