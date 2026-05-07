# Architecture

> System structure, module boundaries, and the data flow from form submit to export.

## Topology

```
Browser (Next.js client)
    │
    │  Server Actions (mutations) + RSC (reads)
    ▼
Next.js App Router on Vercel
    │
    ├── Clerk SDK ──► Clerk (auth, sessions, user mgmt)
    │
    └── Drizzle ──► Neon Postgres (HTTP serverless driver)
```

Single deployable. No separate backend service. No queue, cache, or worker in MVP.

## Modules

```
app/
  (auth)/                         Clerk-protected layout
    sales/
      new/                        Sale form (cajero + admin)
      daily/                      Daily sheet (cajero read-only, admin full)
      monthly/                    Monthly sheet (admin only)
      annual/                     Annual sheet (admin only)
    withdrawals/
      new/                        Withdrawal form (cajero + admin)
      daily|monthly|annual/       Sheets (admin only; cajero blocked)
    expenses/
      new/                        Expense form (admin only)
      list/                       Single filterable list (admin only)
    config/                       (admin only)
      employees/                  Manage Clerk users
      withdrawal-persons/         CRUD list
      card-brands/                CRUD list
  api/
    export/sales/                 Returns xlsx or pdf based on query
    export/withdrawals/
    export/expenses/
    webhooks/clerk/               User mirror sync
  actions/                        Server Actions (mutations)
    sales.ts
    withdrawals.ts
    expenses.ts
    config.ts
```

## Data Flow — Sale Creation (typical write path)

1. Cashier opens `/sales/new` → server checks Clerk session and role; renders form.
2. User fills `total_amount`, picks one or more `payment_methods`. If credit, picks `card_brand` and `installments`.
3. Client validates with zod (sum of methods === total).
4. Submit → Server Action `createSale`.
5. Server Action re-validates with the same zod schema, opens a Drizzle transaction:
   - INSERT into `sales`.
   - INSERT N rows into `sale_payments` (one per method used).
6. DB-level CHECK constraints + AFTER trigger enforce sum invariant — last line of defense.
7. On success, revalidate the daily sheet path and return `{ ok: true }`.

## Data Flow — Daily Sheet (typical read path)

1. Server Component fetches sales for the requested date with all `sale_payments` joined.
2. Aggregates totals (per method, per card brand, per installment) at query level — never in JS.
3. Streams the page with analytics cards above and the table below.
4. Filters and search re-fetch via search params (no client-side state for queries).

## Data Flow — Export

1. User clicks Export Excel / PDF on any sheet view.
2. Browser hits `/api/export/sales?period=daily&date=...&filters=...`.
3. Route Handler runs the same query the page used, builds the workbook (SheetJS) or PDF (jsPDF + autoTable) **server-side** for sheets larger than ~500 rows, **client-side** otherwise.
4. Response is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` or `application/pdf` with `Content-Disposition: attachment`.

## Module Boundaries (do not cross)

- UI components NEVER import Drizzle directly. Server Actions and RSCs are the only DB callers.
- Server Actions NEVER trust the role from the client; always re-read from Clerk session.
- Zod schemas live in `lib/validators/` and are imported by both client form and server action — no duplication.

## Why a monolith and not microservices

At this scale (single location, ~200 sales/day, 5 users), microservices add latency, deploy complexity, and cost without any benefit. The monolith stays until there's a real reason to split.

## Alternatives Considered

- **Edge runtime everywhere** — Neon's HTTP driver works on edge, but Server Actions and Clerk run cleaner on Node runtime. No latency need that justifies edge.
- **tRPC** — Server Actions cover the same use case in App Router with less ceremony. Drop-in if needed later.
- **GraphQL** — overkill. Three resources, simple queries.
- **Background jobs / queues** — not needed in MVP. If digest emails (V2) require async work, Vercel Cron + Inngest are the easy paths.
