# Memory

> Decisions log. The "why" behind the choices, the dead ends we ruled out, and the gotchas worth remembering.

## Decisions

### D-001 — Use Drizzle, not Prisma

**Date:** 2026-04-28
**Why:** Drizzle's HTTP-driver path on Neon serverless has lower cold-start cost than Prisma's query engine binary. Schema-first TypeScript with no runtime overhead. Prisma is more mature but the gain isn't worth the cold-start penalty for this workload.
**Reconsider if:** the team grows and finds Drizzle's query DSL harder to onboard than Prisma's.

### D-002 — Use Clerk, not Auth.js

**Date:** 2026-04-28
**Why:** Mariano needs a UI to invite/manage employees. Clerk ships this out of the box. Auth.js would mean building it ourselves. Free tier (10k MAU) covers ~50x our needs.
**Reconsider if:** Clerk pricing changes or we need fully self-hosted auth for compliance.

### D-003 — Store amounts as `numeric(12,2)`, not integer cents

**Date:** 2026-04-28
**Why:** Postgres `numeric` avoids float drift and reads naturally to non-engineers. The "cents as integer" pattern is faster but adds a mental tax that doesn't pay off at this scale.
**Gotcha:** never let JavaScript `number` touch a money value. Always parse to `Decimal` (decimal.js) or string-format on the server.

### D-004 — Separate `sale_payments` table, not JSONB

**Date:** 2026-04-28
**Why:** querying "total débito Visa this month" is two `WHERE` clauses on a relational schema vs. messy JSONB introspection. FK to `card_brands`, CHECK constraints, indexes — all native. The cost is one extra table; the benefit is every aggregation query is trivial.

### D-005 — Sum invariant enforced at three layers (zod, action, DB trigger)

**Date:** 2026-04-28
**Why:** the rule "sum of payments equals sale total" is the integrity heart of the whole system. Defense in depth is cheap to add now and impossible to retrofit after data corruption.
**Implementation note:** the trigger is `DEFERRABLE INITIALLY DEFERRED` so the parent sale and its payments can be inserted in the same transaction without tripping the check mid-way.

### D-006 — No commission/percentage tracking in MVP

**Date:** 2026-04-28
**Why:** Mariano explicitly said no percentages, only gross sums. Adding it later is purely additive (a new optional table for fees). Premature complexity now would slow MVP without business value.

### D-007 — Single-tenant, single-location

**Date:** 2026-04-28
**Why:** the user confirmed there's only one store and no plans to expand. We don't pay the multi-tenant tax (workspace concept, scoped queries, harder migrations).
**Reconsider if:** a second location appears. Migration to multi-tenant is an entity-id-everywhere refactor — non-trivial but tractable.

### D-008 — Card brands as table, payment methods as enum

**Date:** 2026-04-28
**Why:** payment methods are 4 fixed values defined by the business model — not changing. Card brands legitimately grow (Cabal, Maestro, etc.) — table with `is_active` flag fits better.

### D-009 — Hard delete (admin) instead of soft delete in MVP

**Date:** 2026-04-28
**Why:** simpler model, fewer edge cases in queries. The cashier can't delete anything, so accidental data loss is bounded to admin actions. Soft delete + audit trail upgrade is V2.
**Risk accepted:** Mariano deletes a sale by mistake. Mitigation: confirmation modal + Neon PITR (7-day window).

### D-010 — Spanish in URLs, English in code

**Date:** 2026-04-28
**Why:** users see `/ventas/nueva` (natural language), engineers read `createSale` (industry standard). Mixing is fine because the boundary is clean — routes are mapped explicitly.

### D-011 — Server Actions, not REST/tRPC

**Date:** 2026-04-28
**Why:** App Router native, co-locates form + mutation, no extra dependency. REST kept only for export endpoints (browser needs binary response with `Content-Disposition`).

### D-012 — Sale date is server-set in MVP, no backdating

**Date:** 2026-04-28
**Why:** keeps the form simple, removes a class of bugs around invalid dates. Backdating lands in V1 as an admin-only field.

## Gotchas

### G-001 — Argentina time zone is constant

Argentina doesn't observe DST. `America/Argentina/Cordoba` (or `Buenos_Aires` — same offset) is UTC-3 always. Easy to test, easy to reason about.

### G-002 — Neon serverless connection limits

The HTTP driver has no connection pool limits like the WebSocket driver does. Always use the HTTP driver for serverless functions; reserve the WebSocket driver for long-running scripts.

### G-003 — Clerk webhook order is not guaranteed

`user.created` and `user.updated` can arrive out of order. Always upsert in the webhook handler, never insert.

### G-004 — Server Actions and `revalidatePath`

After a successful mutation, call `revalidatePath` for the affected sheet routes — otherwise the user sees stale data on the next navigation. Cheap to forget; expensive to debug.

### G-005 — `numeric` columns return as string from `pg`

Drizzle returns Postgres `numeric` as a string by default (precision-preserving). Don't `.toFixed()` it as if it were a number; use a Decimal library or string templating.

### G-006 — Aggregating with joined tables can multiply

When joining `sales` and `sale_payments`, `SUM(s.total_amount)` will multiply by the number of payments. Either compute totals from `SUM(sp.amount)` (mathematically equal under the sum invariant) or use a scalar subquery on `sales` for the total.

## Open Questions (revisit before V1)

- Do we need backdating (entering yesterday's missed sale)? Currently `sale_date` is server-set to `now()`. If yes, add an admin-only field.
- Multi-currency (USD)? Currently ARS-only. Adds complexity if introduced.
- Tax (IVA) breakdown per sale? Out of scope today; would change the data model.
- Per-user activity feed? "Carestino logged 47 sales today." Nice-to-have, not necessary.
