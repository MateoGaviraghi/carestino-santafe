# CLAUDE.md — Carestino Santa Fe Brain

This is the implementation context for an internal management system that replaces the paper logbook used by a single retail location in Santa Fe, Argentina. Track sales, withdrawals, and expenses with two roles (Mariano = super admin, cashier = restricted).

**You are coding from the spec, not designing it.** All architectural decisions live in the numbered docs in this folder. If you disagree with a decision, raise it before changing direction.

## Read these first (in order)

1. [00-OVERVIEW.md](./00-OVERVIEW.md) — what we're building and why.
2. [01-CONTEXT.md](./01-CONTEXT.md) — users, roles, hard constraints.
3. [02-STACK.md](./02-STACK.md) — every tech choice + alternatives.
4. [04-DATA-MODEL.md](./04-DATA-MODEL.md) — schema and the sum invariant.
5. [05-API-CONTRACTS.md](./05-API-CONTRACTS.md) — Server Actions and export endpoints.
6. [06-UI-UX.md](./06-UI-UX.md) — flows, layout, key UX rules.
7. [08-SECURITY.md](./08-SECURITY.md) — RBAC matrix and enforcement layers.
8. [09-RULES.md](./09-RULES.md) — coding conventions, naming, don'ts.
9. [03-ARCHITECTURE.md](./03-ARCHITECTURE.md), [07-INFRASTRUCTURE.md](./07-INFRASTRUCTURE.md), [10-MEMORY.md](./10-MEMORY.md), [11-ROADMAP.md](./11-ROADMAP.md) — reference as needed.

## Non-negotiables (the "if you only remember three things")

1. **Sum invariant.** For every sale, `SUM(sale_payments.amount) === sales.total_amount`. Enforce in zod, in the Server Action, and via DB trigger. Without this, the system is wrong.
2. **Server-side RBAC.** Hiding a sidebar link is not security. Every Server Action and Route Handler validates the role from Clerk before doing anything.
3. **Money is `numeric(12,2)` in Postgres + string on the wire + Decimal in code.** JavaScript `number` for money is a defect.

## Build order

Follow the MVP plan in [11-ROADMAP.md](./11-ROADMAP.md). Sales-first, daily sheet, then export. Withdrawals/expenses come after MVP demo.

## When in doubt

- Defer to [09-RULES.md](./09-RULES.md) for conventions.
- Add new decisions to [10-MEMORY.md](./10-MEMORY.md) under a fresh `D-XXX` entry.
- Prefer asking over guessing on anything that touches money or roles.

## Skills worth invoking

- `/nextjs-app-router-patterns` — Server Components, streaming, parallel routes.
- `/nextjs-react-typescript` — general Next.js + TS patterns.
- `/tailwind-design-system` — when extending shadcn tokens.
- `/code-review` — before merging anything that touches money or auth.
- `/security-review` — before the first production deploy.
- `/deploy-to-vercel` — for the first deploy walkthrough.
