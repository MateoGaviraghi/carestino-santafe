# Rules

> Conventions for whoever (or whatever AI) implements this codebase. Read this before opening a file.

## Project Layout

```
codebase/                       (implementation, separate repo or sibling folder)
├── app/
├── components/
├── db/
│   ├── schema.ts
│   └── migrations/
├── lib/
│   ├── auth.ts                 (Clerk helpers, requireRole)
│   ├── validators/             (zod schemas, shared client+server)
│   ├── queries/                (Drizzle query builders)
│   └── utils/
├── middleware.ts
└── drizzle.config.ts
```

## Naming

- **Files:** kebab-case for routes (`sales/new/page.tsx`), kebab-case for components (`sales-form.tsx`).
- **Components:** PascalCase (`SalesForm`).
- **DB tables:** snake_case, plural (`sale_payments`, not `salePayment`).
- **DB columns:** snake_case (`created_at`).
- **TypeScript types:** PascalCase (`Sale`, `SalePayment`).
- **Zod schemas:** `<entity>Schema` or `create<Entity>Schema` (`createSaleSchema`).
- **Server actions:** verbNoun (`createSale`, `deleteWithdrawal`).
- **Routes:** Spanish in URL where the user sees them (`/ventas/nueva`), English in code identifiers.

## Money

- Always `numeric(12,2)` in Postgres.
- On the wire: string. On the server: parse with `decimal.js` before arithmetic.
- **NEVER** use JavaScript `number` for amounts. Float math will silently lose cents.

## Dates and Time Zones

- Store as `timestamptz`.
- App TZ: `America/Argentina/Cordoba` (no DST in Argentina, but be explicit).
- Format dates for the UI with `date-fns-tz` using the app TZ. Never `new Date().toLocaleString()` without a TZ.
- "Today" means today in app TZ, not UTC.

## Forms

- One zod schema per form, lives in `lib/validators/`.
- Same schema runs on client (RHF resolver) and on server (start of every action). Don't fork.
- Server Actions return `{ ok: false, error }` for business errors; throw only for auth/role.

## Server Actions

- Always start with:
  ```ts
  'use server';
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new Error('unauthorized');
  requireRole(sessionClaims, [...allowed]);
  const parsed = schema.parse(input);  // throws ZodError → caught and mapped to ok:false
  ```
- Wrap multi-row mutations in `db.transaction(...)`.
- Call `revalidatePath` or `revalidateTag` on success.

## Database

- Define schema in `db/schema.ts` only. No inline `sql\`...\`` in route files.
- Queries in `lib/queries/`. Group by entity (`lib/queries/sales.ts`).
- Aggregations are SQL-side, not JS-side. No `.map().reduce()` totals over 10k rows.
- Add indexes when you write a query. Don't wait for slowness.

## UI

- shadcn components live under `components/ui/`. Don't fork them — extend.
- Page-level components in `app/.../page.tsx`. Keep them server-rendered unless interactivity demands client.
- Client components only when needed (`'use client'`). Forms are client; tables are server-rendered with client-side filter inputs that update search params.

## Don'ts

- ❌ Don't use `any`. If you need to escape the type system, `unknown` + a narrow.
- ❌ Don't store amounts as cents (integer) — we use `numeric(12,2)`. Pick one and stick to it.
- ❌ Don't trust the client. Re-validate every input on the server.
- ❌ Don't fetch data in a Client Component when an RSC would do.
- ❌ Don't add a library without listing why in `10-MEMORY.md` and getting agreement.
- ❌ Don't do client-side role gating without matching server-side enforcement.
- ❌ Don't ship a feature without thinking about the cashier's view.

## Testing

MVP testing is light:

- **Unit:** zod schemas (especially the sum-invariant rule).
- **Integration:** one happy-path test per Server Action against a Neon test branch.
- **E2E:** Playwright on the three critical flows (create sale single-method, create sale mixed, create withdrawal). One test run before each prod deploy.

V1 expands to per-entity coverage. V2 adds visual regression on the sheets.

## Code Review (when this becomes a team thing)

- One reviewer minimum, two for schema changes.
- Schema PRs include the generated migration file.
- Use the `/code-review` skill on PRs that touch money, auth, or constraints.

## Recommended skills for the implementer

- `/nextjs-app-router-patterns` — when wiring Server Components, streaming, parallel routes.
- `/nextjs-react-typescript` — general Next.js + TS patterns.
- `/tailwind-design-system` — when extending shadcn tokens.
- `/code-review` — pre-merge audits.
- `/security-review` — pre-launch audit.
