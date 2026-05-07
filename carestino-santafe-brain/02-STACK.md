# Stack

> Technology decisions for Carestino Santa Fe Brain, with the alternatives considered for each.

## Summary

| Layer | Choice |
|---|---|
| Frontend + Backend | Next.js 15 (App Router) + TypeScript |
| Database | Neon Postgres (serverless) |
| ORM | Drizzle |
| Auth | Clerk |
| UI | Tailwind CSS + shadcn/ui |
| Forms | react-hook-form + zod |
| Charts | Recharts |
| Excel export | SheetJS (xlsx) |
| PDF export | jsPDF + jspdf-autotable |
| Hosting | Vercel |
| Date handling | date-fns + date-fns-tz |
| Money handling | decimal.js |

All free-tier compatible. No paid services in MVP.

## Framework — Next.js 15 (App Router)

**Why:** monolith covers UI, API, and server-side validation in one deploy. Server Actions kill 80% of the API boilerplate. First-party Vercel hosting. Mature ecosystem.

**Alternatives considered:**
- **Remix** — equivalent capabilities, smaller community in Argentina. No win.
- **SvelteKit** — fewer hands-on engineers locally. Riskier for handoff.
- **Separate React SPA + Express/Fastify backend** — more files, more deploy surface, no benefit at this scale.

## Database — Neon Postgres

**Why:** the user already chose it. Serverless Postgres, branchable, generous free tier, scales to zero. Postgres gives us proper constraints (CHECK for sum validation), enums, and full SQL.

**Alternatives considered:**
- **Supabase** — also valid, includes auth and storage. User explicitly preferred Neon.
- **PlanetScale** — MySQL, no CHECK constraints, less ideal for the sum-must-equal-total invariant.
- **SQLite + Turso** — fine, but Postgres feature set wins for analytics queries.

## ORM — Drizzle

**Why:** TypeScript-first, generates types from schema, runs well on Vercel serverless and Neon's HTTP driver, no separate migration runtime, lightweight.

**Alternatives considered:**
- **Prisma** — more mature, but its query engine adds cold-start cost on serverless and the Neon adapter is newer than Drizzle's. Heavier for this scale.
- **Kysely** — type-safe query builder, no schema-as-code. More boilerplate for migrations.
- **Raw SQL via `pg`** — fastest to write at first, but no type safety on results. Not worth the savings.

## Auth — Clerk

**Why:** chosen over Auth.js because the owner needs a built-in UI to invite/manage employees. Clerk's `<UserButton>`, organization invitations, and admin dashboard remove an entire feature module from the build.

**Alternatives considered:**
- **Auth.js (NextAuth)** — free, no third-party. Would require building the employee management UI from scratch.
- **Better Auth** — newer, growing fast, but the management UI story is weaker today.
- **Lucia** — sunset announcement made it a non-starter.

## UI — Tailwind + shadcn/ui

**Why:** shadcn/ui is copy-in components, no runtime, full source control, accessible primitives via Radix. Tailwind for everything else.

**Alternatives considered:**
- **Mantine / Chakra** — runtime libraries, less control, larger bundles.
- **Material UI** — heavy, opinionated styling, harder to brand.

## Forms — react-hook-form + zod

**Why:** RHF is the de-facto Next.js form library. Zod schemas are reused for client validation, server-action validation, and Drizzle row-level checks.

No serious alternatives at this scale.

## Charts — Recharts

**Why:** sufficient for the analytics cards and time-series we need (totals per day, per month). Battle-tested, declarative.

**Alternatives considered:**
- **visx** — lower-level, more code for the same result.
- **Tremor** — built on Recharts, opinionated dashboards. Could simplify analytics views; revisit in V2 if dashboards grow.

## Export — SheetJS + jsPDF + autoTable

**Why:** both run client-side in the browser, no server cost, no extra dependency on external rendering services.

**Alternatives considered:**
- **Puppeteer / Playwright server-side PDF** — heavyweight, exceeds Vercel's free-tier function limits for cold starts.
- **react-pdf** — better-looking PDFs, more code, slower.
- **ExcelJS** — fine alternative to SheetJS, similar surface. Either works; SheetJS is more widely used.

## Money — decimal.js

**Why:** JavaScript `number` cannot represent money safely (`0.1 + 0.2 !== 0.3`). `decimal.js` gives arbitrary-precision arithmetic. The Postgres column is `numeric(12,2)`; on the wire we use string; in code we use `Decimal`.

**Alternatives considered:**
- **`bignumber.js`** — equivalent. Pick one and stick with it.
- **Cents as integer** — viable but adds a mental tax for the team. We chose `numeric(12,2)` for clarity.
