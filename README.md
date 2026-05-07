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
| `npm run db:check` | Verify Neon connection, tables, sum-invariant trigger, seed. |
| `npm run db:seed` | Idempotent seed of `card_brands` (Visa, Mastercard, Amex, Naranja). |
| `npm run db:test-invariant` | Smoke test: valid sale OK, sum-mismatch rejected with `P5001`. |
| `npm run db:backfill-users` | Pull users from Clerk Admin API into local `users`. Use after first deploy or to recover from missed webhooks. |
| `npm test` | Run Vitest suite (currently: webhook handler tests). |

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
- In **Configure → Sessions → Customize session token**, add to the JSON:
  ```json
  { "publicMetadata": "{{user.public_metadata}}" }
  ```
  Without this, `sessionClaims.publicMetadata.role` is empty server-side and every `requireRole()` call throws `forbidden`.
- Enable MFA on Mariano's account (free).

#### Webhook (users mirror)

The local `users` table is kept in sync with Clerk via Svix-signed webhooks.

1. **Configure → Webhooks → Add Endpoint**.
2. **Endpoint URL**: `https://<your-vercel-domain>/api/webhooks/clerk`
   (for local dev, expose `localhost:3000` with ngrok and use that URL).
3. **Subscribe to events**: `user.created`, `user.updated`, `user.deleted`.
4. **Save** → copy the **Signing secret** (starts with `whsec_`) → set `CLERK_WEBHOOK_SECRET` in Vercel + `.env.local`.

If the webhook missed events (deploy was down, secret was rotated, etc.) re-sync everything by running:
```bash
npm run db:backfill-users
```
This pulls every Clerk user via Admin API and upserts them into `users`. Idempotent.

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

## Production smoke checklist

Run this once after the first prod deploy and after every significant change:

1. **Health** — `GET https://<your-domain>/api/health` returns `200 { ok: true, db: "up" }`.
2. **Sign-in** — open the homepage, click *Iniciar sesión*, log in as the test user.
3. **Role badge** — the home shows your role in green (`super_admin`).
4. **Sale (single method)** — `/ventas/nueva`, total `1000`, efectivo `1000`, *Continuar* → confirm dialog → *Confirmar venta* → success modal.
5. **Sale (mixed)** — total `1500`, payment 1 efectivo `500`, payment 2 crédito Visa 3 cuotas `1000`, save.
6. **Sum mismatch (negative test)** — total `1000`, efectivo `999`, button stays disabled, restante shows `$1,00` in red.
7. **Daily sheet** — `/ventas/diaria` shows the analytics cards updated and the table with both sales.
8. **Filters** — toggle *Crédito*, only the mixed sale appears; clear filters; type "test" in search; clear.
9. **Excel export** — *Excel* button downloads `ventas-diaria-YYYY-MM-DD.xlsx`. Open it: orange Resumen header, Ventas tab with autofilter, monto right-aligned in `$#,##0.00`.
10. **PDF export** — *PDF* button downloads the same date as `.pdf`. Open it: orange header block with the 8 cards, detalle table below, footer "Página 1 de N".
11. **Sign out** — *UserButton* (top-right avatar) → sign out, redirects to landing.

Anything red, fix before handing off to Mariano.

## Handing off to Mariano (one-time)

1. **Create his Clerk user** as documented in step 5 above with `{ "role": "super_admin" }`.
2. Sit with him once and walk through the daily flow:
   - Cargar una venta → confirmar → ver toast verde.
   - Abrir planilla diaria → entender los cards y la tabla.
   - Cambiar de día con el date picker.
   - Aplicar filtros, ver cómo cambian los cards.
   - Exportar Excel y PDF — abrir cada uno.
3. Recordarle que **no hace falta Enter en el buscador** (es vivo).
4. Dejarle anotado el link directo a `/ventas/diaria` como home alternativo si lo prefiere.

## Out of scope for MVP (V1+ work)

These are intentionally NOT in MVP and live in [11-ROADMAP.md](./carestino-santafe-brain/11-ROADMAP.md):

- Editar / eliminar ventas (super_admin) con confirmación tipeada "ELIMINAR".
- Módulo Retiros (form + planillas + export).
- Módulo Gastos (form + lista filtrable + export).
- Planillas mensual y anual con drill-down.
- UI `/configuracion/empleados`, `/configuracion/marcas-de-tarjeta`, `/configuracion/personas-que-retiran`.
- Sentry + UptimeRobot + monthly `pg_dump` backup.
- Soft delete + audit log (V2).

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
