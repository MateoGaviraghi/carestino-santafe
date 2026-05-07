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

### D-013 — `db.batch()` instead of `db.transaction()` (neon-http limitation)

**Date:** 2026-05-07
**Why:** `drizzle-orm/neon-http` does not implement `db.transaction()` — calling it throws `No transactions support in neon-http driver`. We need atomicity for `INSERT INTO sales + INSERT INTO sale_payments` so the DEFERRABLE trigger fires at COMMIT after both rows exist. `db.batch([...])` ships every query in a single HTTP request to Neon's `/sql/v1/transaction` endpoint, which wraps them in `BEGIN ... COMMIT` server-side — the same atomicity guarantee, just with a different Drizzle API.
**Implementation note:** because `batch` queries can't pipe values between each other, we pre-generate the `sale.id` in app code (`crypto.randomUUID()`) so the second insert can reference it without a chained `RETURNING`. This contradicts the original 09-RULES.md guidance ("wrap multi-row mutations in `db.transaction(...)`") — read that rule as "use the atomic API for the driver in use".
**Reconsider if:** we switch to the WebSocket driver (`drizzle-orm/neon-serverless`), which does support real `transaction()` blocks. The trade-off is keep-alive + cold-start cost on serverless functions; not worth it at MVP scale.

### D-014 — Webhook defaults missing `publicMetadata.role` to `cajero`

**Date:** 2026-05-07
**Why:** `users.role` is `NOT NULL`. The Clerk webhook may fire before an admin has set the role in `publicMetadata` (especially for self-signed-up users in any future flow, or for the first event of a new user created via Dashboard but without metadata set yet). Defaulting to `cajero` (least privilege) lets the row exist without violating the CHECK constraint, and the role is overwritten on every subsequent `user.updated`, so promoting from `cajero` to `super_admin` in the dashboard eventually propagates.
**How to apply:** never assume a fresh row in `users` is privileged. The source of truth for the role is still Clerk `publicMetadata.role`; the local mirror exists only for FK ergonomics.
**Reconsider if:** we add an admin-only invite flow that pre-sets the role server-side before Clerk fires the event — at that point the default could be `null` and the webhook could reject events without a role.

### D-016 — Admin-only date editing on UPDATE (60-day backwards window)

**Date:** 2026-05-07
**Why:** D-012 froze `sale_date` to `now()` on creation to keep MVP simple. V1 introduces `updateSale` (super_admin) and we need a way to fix the date of a misregistered sale (Mariano caught a typo a week later, end-of-month reconciliation surfaces an error from earlier in the period, etc.). Without backdating-on-edit, the only remediation path is direct SQL — which defeats the whole point of building edit/delete.
**How to apply:**
- `createSale` keeps server-set `sale_date = now()` — no change.
- `updateSale` accepts an optional `saleDate` (string `YYYY-MM-DD`). When provided, validate `[today − 60 days, today]` interpreted in `America/Argentina/Cordoba`. Out of range → `validation_error`.
- The original wall-clock TIME of the sale is preserved — only the calendar day moves. This avoids accidentally erasing the timestamp ordering inside a day's planilla and keeps the UX honest (the edit form shows a date picker, not a time picker).
- Same window applies to `updateWithdrawal` and `updateExpense` when those land later in V1.
**Reconsider if:** Mariano's accountant needs to fix sales older than 60 days at year-end. Easy widening to 90 days; full removal of the cap would require an audit log (V2) to be safe.

### D-017 — Edit UX is a dedicated route, not a modal

**Date:** 2026-05-07
**Why:** the sale form has multiple dynamic rows (payments) plus a confirm dialog plus a success modal. Stacking that inside another modal would either trap focus poorly or get cramped on smaller screens. A dedicated route also makes the URL shareable ("manda el link de la venta a editar") and gives us natural state isolation per edit session.
**How to apply:**
- New route `app/ventas/[id]/editar/page.tsx`, super_admin-gated, redirects cashier to `/`.
- Server component fetches the sale + payments + active card brands, maps to `CreateSaleInput`, renders `SaleForm` with `mode='edit'`, `defaultValues=...`, `saleId=...`.
- `SaleForm` becomes a discriminated component. In `mode='edit'` it shows a date picker (per D-016) and switches the submit handler to `updateSale`. After success it navigates back to `/ventas/diaria` (instead of resetting in place).
**Reconsider if:** mobile-only usage shows that a route change is too disruptive — but Carestino is a desktop-first internal tool, so unlikely.

### D-018 — Delete policy: hard for transactions, soft for config

**Date:** 2026-05-07
**Why:** D-009 chose hard delete for transactions (sales) in MVP. V1 extends edit/delete to withdrawals and expenses; we need a single coherent policy across both transactional and config tables.
**How to apply:**
- **Hard delete with typed-confirmation modal ("ELIMINAR")** for `sales`, `withdrawals`, `expenses`. Children cascade via FK (`sale_payments` already has `ON DELETE CASCADE`; withdrawals and expenses have no children). Mistakes are recoverable for 7 days via Neon PITR (G-001). Soft-delete + audit log lands in V2.
- **Soft delete (toggle `is_active = false`)** for `card_brands` and `withdrawal_persons`. These are referenced by historical transactional rows; hard-deleting them would either orphan the FK (if we drop the constraint, which we will not) or require deleting every historical reference (which destroys data Mariano legitimately needs). The MVP `card_brands` config UI already implements this pattern; V1 mirrors it for `withdrawal_persons`.
**Reconsider if:** an audit log + soft-delete-everywhere model lands in V2 — at that point hard-delete is replaced by `deleted_at = now()` and an undelete affordance.

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
