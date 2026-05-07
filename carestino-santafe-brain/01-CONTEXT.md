# Context

> Constraints, assumptions, and stakeholder details that shaped every decision in this project.

## Users and Roles

| Role | Who | Permissions |
|---|---|---|
| `super_admin` | Mariano | Full CRUD on sales, withdrawals, expenses. Manages employees, withdrawal persons, card brands. Sees all reports. |
| `cajero` | Carestino + future employees | Creates sales and withdrawals. Reads daily sales sheet (no edit). Cannot see monthly/annual reports, expenses, withdrawals report, or any config. |

Roles are stored in Clerk `publicMetadata.role` and validated server-side on every action.

## Operational Context

- **Single retail location** in Santa Fe, Argentina.
- **Sells merchandise only** — no service categories needed for expenses.
- **Always-online** — stable internet, no offline requirement.
- **Internal use only** — not customer-facing, no public surface.
- **Argentinian payment methods** — Visa, Mastercard, Amex, Naranja are the relevant card brands. Cabal/Maestro may be added later via the editable list.
- **Currency:** ARS. All amounts stored as decimal with 2 fractional digits.

## Assumptions

- Daily transaction volume is low-to-moderate (under ~200 sales/day). No hot-path performance concerns.
- Owner reviews reports from a desktop browser. Cashier logs entries from desktop or tablet.
- Spanish is the only UI language. No i18n needed.
- Date semantics: every entry's date is `now()` at the moment of submission. No backdating in MVP. (See `11-ROADMAP.md` for V1.)

## Hard Constraints

- **Free-tier hosting only** — Vercel + Neon free plans. Clerk free tier (10k MAU is overkill for ~5 users).
- **No source code in this repository** — these documents are the architectural specification. Implementation happens in a separate codebase.
- **Mixed payment validation** — when a sale is paid with multiple methods, the sum of method amounts must equal the sale total exactly. The DB and the form both enforce this.

## Out of Context (explicitly)

- Tax/AFIP integration is NOT part of this system. The owner handles fiscal compliance separately.
- This is not a billing/invoicing system. It records what happened, not what was issued.
- No audit trail beyond `created_by` + timestamps in MVP. Soft-delete and edit history land in V2.
