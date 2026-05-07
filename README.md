# Carestino Santa Fe

Internal management system for the Carestino retail location in Santa Fe, Argentina.
Replaces the paper logbook used to track daily sales, cash withdrawals and expenses.

> **Architectural specification** lives in [`carestino-santafe-brain/`](./carestino-santafe-brain/).
> Read [`carestino-santafe-brain/CLAUDE.md`](./carestino-santafe-brain/CLAUDE.md) before contributing.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui (new-york)
- Drizzle ORM + Neon Postgres (HTTP serverless driver)
- Clerk (auth + role mgmt via `publicMetadata.role`)
- react-hook-form + zod (shared client/server schemas)
- decimal.js for money, date-fns-tz for time (`America/Argentina/Cordoba`)
- SheetJS (xlsx) + jsPDF for export
- Vercel (Hobby) hosting, GitHub Actions / Vercel CI

## Local development

1. Install Node 20+ and clone the repo.
2. `cp .env.example .env.local` and fill in values (see below).
3. `npm install`
4. `npm run dev`

### Required environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled HTTP connection string. Used at runtime. |
| `DATABASE_URL_UNPOOLED` | Neon direct connection. Used by `drizzle-kit` migrations. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key. |
| `CLERK_SECRET_KEY` | Clerk backend key. |
| `CLERK_WEBHOOK_SECRET` | Svix signing secret for `/api/webhooks/clerk`. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app. |
| `TZ` | `America/Argentina/Cordoba` always. |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run format` | Prettier write. |
| `npm run db:generate` | Generate Drizzle migration from `db/schema.ts`. |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL_UNPOOLED`. |
| `npm run db:studio` | Open Drizzle Studio. |

## First-time deploy (one-time setup)

### 1. Provision external services

- **Neon:** create a project (region `aws-sa-east-1` if available, else `us-east-1`). Copy the pooled and unpooled connection strings.
- **Clerk:** create an application. Copy publishable + secret keys.
- **Vercel:** import the GitHub repo. Do *not* set env vars yet.

### 2. Install Vercel ↔ Neon integration

In the Vercel project → **Integrations** → install **Neon**. Pick the Neon project; this auto-injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and creates a fresh DB branch on every preview.

### 3. Add the remaining env vars in Vercel

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `TZ=America/Argentina/Cordoba`. Set them for **Production**, **Preview** and **Development**.

### 4. Configure Clerk

- Add the Vercel URL to Clerk **Allowed origins**.
- In **JWT Templates → default session token**, add `publicMetadata` to the claims so `sessionClaims.publicMetadata.role` is readable server-side.
- Enable MFA on Mariano's account (free).

### 5. Create the super admin (Mariano)

The role is the source of truth in Clerk. **The webhook only mirrors data — it does not assign roles.** Bootstrap manually before Mariano's first sign-in:

1. Open the Clerk Dashboard → **Users** → **Create user**.
2. Use Mariano's real email + temporary password.
3. Open the user → **Public metadata** → set:
   ```json
   { "role": "super_admin" }
   ```
4. Mariano signs in for the first time. He'll see the full UI.

For new cashier employees later: same flow with `{ "role": "cajero" }`. (V1 ships an in-app `/configuracion/empleados` UI for this.)

### 6. First deploy

Push to `main` → Vercel builds and deploys. Health check: `GET /api/health` should return `{ ok: true, db: "up" }`.

## Conventions

See [`carestino-santafe-brain/09-RULES.md`](./carestino-santafe-brain/09-RULES.md) for naming, money handling, RBAC enforcement, and don'ts. The three non-negotiables:

1. **Sum invariant** for sales (zod + Server Action + DB trigger).
2. **Server-side RBAC** on every Server Action and Route Handler.
3. **Money is `numeric(12,2)` + string on the wire + `Decimal` in code.** Never JS `number`.

## Repository layout

```
app/                 Next.js App Router (UI + Server Actions + Route Handlers)
  actions/           Server Actions (mutations)
  api/               Route Handlers (export, webhooks, health)
components/          React components
  ui/                shadcn/ui (don't fork — extend)
db/                  Drizzle schema + client
lib/
  auth.ts            requireRole helper, Clerk session reader
  money.ts           Decimal helpers
  utils.ts           cn() and small utilities
  validators/        zod schemas (shared client + server)
  queries/           Drizzle query builders
middleware.ts        Clerk middleware (route protection)
drizzle/             Generated migrations (committed)
carestino-santafe-brain/  Architectural spec (source of truth for design)
```
