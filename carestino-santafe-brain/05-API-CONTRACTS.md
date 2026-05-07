# API Contracts

> Server Actions for mutations and Route Handlers for export. Reads happen in React Server Components and don't appear here.

## Conventions

- Mutations are **Server Actions** at `app/actions/*.ts`. Inputs validated with zod, output is `{ ok: true, data } | { ok: false, error }`.
- Exports are **Route Handlers** at `app/api/export/*` so the browser can request a binary file with `Content-Disposition`.
- Every action calls `requireRole(...)` first. Unauthorized → throws, caught by error boundary.
- All amounts are strings on the wire (zod `.string().regex(/^\d+(\.\d{1,2})?$/)`) → parsed to `Decimal` on the server. Avoids float drift.

## Error Shape

```ts
type ActionError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'sum_mismatch'           // payments don't add up to total
  | 'not_found'
  | 'internal_error';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError; message?: string };
```

## Sales

### `createSale` (action)

Roles: `super_admin`, `cajero`.

```ts
input: {
  totalAmount: string,                     // "1234.50"
  observations?: string,
  payments: Array<{
    method: 'efectivo' | 'transferencia' | 'debito' | 'credito',
    amount: string,
    cardBrandId?: number,                  // required if method ∈ {debito, credito}
    installments?: 1 | 3 | 6,              // required if method = credito
  }>,
}

invariants:
  - payments.length >= 1
  - sum(payments[].amount) === totalAmount   (Decimal equality)
  - method=debito ⇒ cardBrandId set, installments null
  - method=credito ⇒ cardBrandId set, installments ∈ {1,3,6}
  - method ∈ {efectivo, transferencia} ⇒ cardBrandId null, installments null

output: { ok: true, data: { saleId: string } } | { ok: false, error }
```

### `updateSale` (action)

Role: `super_admin` only. Same input as create, plus `id`. Replaces all `sale_payments` rows for that sale in a single transaction.

### `deleteSale` (action)

Role: `super_admin` only. Hard delete (cascades to `sale_payments`). UI requires a typed confirmation ("ELIMINAR").

## Withdrawals

### `createWithdrawal` (action)

Roles: `super_admin`, `cajero`.

```ts
input: {
  amount: string,
  personId: number,
}
output: { ok: true, data: { withdrawalId: string } }
```

### `updateWithdrawal` / `deleteWithdrawal` (actions)

Role: `super_admin` only.

## Expenses

### `createExpense` (action)

Role: `super_admin` only.

```ts
input: {
  provider: string,
  amount: string,
  method: 'efectivo' | 'transferencia' | 'debito' | 'credito',
  cardBrandId?: number,
  installments?: 1 | 3 | 6,
  observations?: string,
}
output: { ok: true, data: { expenseId: string } }
```

Same conditional rules for `cardBrandId` / `installments` as `sale_payments`.

### `updateExpense` / `deleteExpense` (actions)

Role: `super_admin` only.

## Config (super_admin only)

| Action | Behavior |
|---|---|
| `addEmployee` | Calls Clerk `users.createUser` then mirrors into `users` with role `cajero`. |
| `deactivateEmployee` | Sets `is_active = false` and revokes Clerk session. |
| `addCardBrand`, `deactivateCardBrand` | CRUD on `card_brands`. |
| `addWithdrawalPerson`, `deactivateWithdrawalPerson` | CRUD on `withdrawal_persons`. |

Deactivate (not delete) is the default — keeps FK history valid in past sales/withdrawals/expenses.

## Export Endpoints

### `GET /api/export/sales`

Query params:

| Param | Values | Required |
|---|---|---|
| `period` | `daily` \| `monthly` \| `annual` | yes |
| `date` | ISO date (anchor for the period) | yes |
| `format` | `xlsx` \| `pdf` | yes |
| `q` | search string (matches observations) | no |
| `method` | `efectivo` \| `transferencia` \| `debito` \| `credito` | no |
| `cardBrandId` | int | no |
| `installments` | 1 \| 3 \| 6 | no |

Roles: `super_admin` for monthly/annual. `cajero` may export `daily` only.

Response: binary file with `Content-Disposition: attachment; filename="ventas-2026-04-28.xlsx"`.

### `GET /api/export/withdrawals`

Same shape (without `method` filter). Roles: `super_admin` only.

### `GET /api/export/expenses`

No `period` (single list). Filters: `q`, `provider`, `method`, `cardBrandId`, `installments`, `from`, `to`. Roles: `super_admin` only.

## Webhooks

### `POST /api/webhooks/clerk`

Inbound from Clerk for `user.created`, `user.updated`, `user.deleted`. Verify Svix signature on every call; reject unsigned. Idempotent upsert into `users`.

## Alternatives Considered

- **REST API instead of Server Actions** — would require duplicating every endpoint; Server Actions co-locate mutation + form. REST kept only where the browser needs a binary response (export).
- **tRPC** — clean, but Server Actions cover this surface with no extra dependency.
- **GraphQL** — three resources don't justify it.
- **Optimistic updates** — not in MVP. Server roundtrip is fast enough for ~5 users; revisit if cashier complains.
