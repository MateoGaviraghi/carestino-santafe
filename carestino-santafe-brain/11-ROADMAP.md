# Roadmap

> Phased delivery: MVP → V1 → V2. Sequenced for risk, not for size.

## MVP — 2 weeks (target: ship the daily sales flow live)

**Goal:** Mariano stops using the paper sheet for sales. The other modules can wait if needed.

| Day | Deliverable |
|---|---|
| 1 | Repo scaffolding: Next.js 15, Tailwind, shadcn, Drizzle, Clerk wired. CI deploys to Vercel. |
| 2 | DB schema: `users`, `card_brands`, `sales`, `sale_payments`. Migrations + seed for brands. |
| 3 | Clerk integration: sign-in, role middleware, webhook → users mirror. |
| 4–5 | Sale form (single + mixed methods), sum-invariant validation across all 3 layers. |
| 6 | Daily sales sheet (admin and cashier views) with analytics cards. |
| 7 | Filters + URL search params on the daily sheet. |
| 8 | Excel export (daily). |
| 9 | PDF export (daily). |
| 10 | Polish, accessibility pass, role tests. **MVP demo to Mariano.** |
| 11–14 | Buffer for fixes, real-data validation in production by Mariano. |

**MVP includes:**
- Auth + RBAC.
- Sales (create + daily sheet + filters + export).
- Configuration of card brands (so Mariano can add a brand if needed mid-test).

**MVP excludes (deliberately):**
- Withdrawals module.
- Expenses module.
- Monthly / annual sheets.
- Employee management UI (added by Clerk Dashboard during MVP).

## V1 — 2 more weeks

**Goal:** complete the system. Replace paper for everything, not just sales.

- Withdrawals: form + daily/monthly/annual sheets + export.
- Expenses: form + filtered list + export.
- Monthly + annual sales sheets with drill-down.
- Employee management UI in `/config/employees`.
- Withdrawal persons CRUD.
- Card brands CRUD UI (already DB-ready from MVP).
- Edit / delete actions for super admin (with confirmation modal).
- Sentry wired, UptimeRobot configured.

## V2 — When V1 is stable in production

**Quality of life and audit:**

- **Soft delete + audit log.** Every mutation creates an `audit_events` row. Restore deleted rows from admin UI.
- **Backdating** for admin (enter a sale that happened yesterday with the correct date).
- **Activity feed** on the dashboard ("Carestino logged 47 sales today, $234,500 total").
- **Search across modules** (header search box).
- **Saved filter presets** ("Crédito Visa este mes").
- **Email digest** to Mariano: weekly summary on Mondays.

## V3 — Optional, only if the business asks

- **Commissions module** (still no percentages — only fixed amounts per liquidation).
- **Multi-location support** (workspace/store concept, scoped queries).
- **Mobile-native app** if cashier complains about tablet ergonomics.
- **Bank reconciliation:** import bank statement CSV and match against transfers/cards.
- **AFIP / fiscal export** (if the accountant asks).

## What we'll never build (unless the world changes)

- Customer database.
- Inventory.
- E-commerce.
- POS hardware integration.
- Invoicing / billing.

These are different products. Carestino Santa Fe Brain is a **financial logbook**, not an ERP.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mariano deletes a sale by accident | Medium | High | Confirmation modal + Neon 7-day PITR |
| Cashier finds a way to view monthly sheet | Low | Medium | Server-side role check on every route + RBAC tests |
| Free tier limit hit (Neon 0.5 GB) | Low (years away) | Low | Upgrade to Launch ($19/mo) when needed |
| Clerk pricing changes | Low | Medium | Auth.js migration is ~200 lines; documented as fallback |
| Neon outage | Low | High | Status page subscription + manual `pg_dump` monthly |
