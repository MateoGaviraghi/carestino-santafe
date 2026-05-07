# Data Model

> Postgres schema for Carestino Santa Fe Brain. Drizzle definitions live in the codebase; this is the source of truth for shape, constraints, and reasoning.

## Entities

```
users (mirrored from Clerk)
  └── creates ──► sales, withdrawals, expenses

sales 1 ──── N sale_payments
                    └── references ──► card_brands (nullable)

withdrawals N ──► withdrawal_persons

expenses N ──► card_brands (nullable)

card_brands       (config table, editable by super_admin)
withdrawal_persons (config table, editable by super_admin)
```

## Tables

### `users`

Mirror of Clerk users. We don't store passwords or PII beyond what's needed for FK references and display.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Clerk user id |
| `email` | text | nullable |
| `display_name` | text | "Mariano", "Carestino" |
| `role` | text NOT NULL | enum: `super_admin` \| `cajero` (mirrored from Clerk publicMetadata) |
| `is_active` | boolean | default true |
| `created_at` | timestamptz | default now() |

Synced via Clerk webhooks (`user.created`, `user.updated`, `user.deleted`).

### `card_brands`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text UNIQUE NOT NULL | "Visa", "Mastercard", "Amex", "Naranja" |
| `is_active` | boolean | default true (soft delete) |
| `created_at` | timestamptz | |

Seed: Visa, Mastercard, Amex, Naranja. Mariano can add more from `/config/card-brands`.

### `withdrawal_persons`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text UNIQUE NOT NULL | "Mariano", "Cintia", "Roxana" |
| `is_active` | boolean | default true |
| `created_at` | timestamptz | |

Seed: Mariano, Cintia, Roxana.

### `sales`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `total_amount` | numeric(12,2) NOT NULL | CHECK > 0 |
| `observations` | text | nullable, no length limit |
| `sale_date` | timestamptz NOT NULL | default `now()` (server-set, not client-supplied in MVP) |
| `created_by` | text NOT NULL | FK → users.id |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

Indexes: `(sale_date DESC)`, `(created_by, sale_date DESC)`.

### `sale_payments`

One row per payment method used in a sale. A sale paid 100% in cash has 1 row; a mixed sale has 2+ rows.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sale_id` | uuid NOT NULL | FK → sales.id ON DELETE CASCADE |
| `method` | text NOT NULL | enum: `efectivo` \| `transferencia` \| `debito` \| `credito` |
| `amount` | numeric(12,2) NOT NULL | CHECK > 0 |
| `card_brand_id` | int | FK → card_brands.id; **required** when method ∈ {`debito`, `credito`}, NULL otherwise |
| `installments` | smallint | **required** when method = `credito`; NULL otherwise. Allowed values: 1, 3, 6 |

CHECK constraints:

```sql
CHECK (
  (method IN ('debito','credito') AND card_brand_id IS NOT NULL)
  OR
  (method IN ('efectivo','transferencia') AND card_brand_id IS NULL)
)

CHECK (
  (method = 'credito' AND installments IN (1,3,6))
  OR
  (method <> 'credito' AND installments IS NULL)
)
```

Indexes: `(sale_id)`, `(method, sale_id)`.

**Sum invariant** — the most important rule of this model:

```
SUM(sale_payments.amount WHERE sale_id = X) === sales.total_amount WHERE id = X
```

Enforced at three layers:

1. **Zod schema** (client + server action) — front line.
2. **Server Action transaction** — explicit assert after insert.
3. **DB trigger** (`AFTER INSERT OR UPDATE OR DELETE ON sale_payments`) that raises if the sum diverges. Belt-and-suspenders for any direct DB write that bypasses the app.

```sql
-- Sketch of the trigger function
CREATE OR REPLACE FUNCTION assert_sale_payments_sum() RETURNS trigger AS $$
DECLARE
  expected numeric(12,2);
  actual numeric(12,2);
  target_sale uuid;
BEGIN
  target_sale := COALESCE(NEW.sale_id, OLD.sale_id);
  SELECT total_amount INTO expected FROM sales WHERE id = target_sale;
  SELECT COALESCE(SUM(amount), 0) INTO actual FROM sale_payments WHERE sale_id = target_sale;
  IF expected IS NOT NULL AND expected <> actual THEN
    RAISE EXCEPTION 'sum_mismatch: payments=% expected=%', actual, expected;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_assert_sale_payments_sum
AFTER INSERT OR UPDATE OR DELETE ON sale_payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_sale_payments_sum();
```

The `DEFERRABLE INITIALLY DEFERRED` is critical — it lets a single transaction insert the parent `sale` and all `sale_payments` before the check fires.

### `withdrawals`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `amount` | numeric(12,2) NOT NULL | CHECK > 0 |
| `person_id` | int NOT NULL | FK → withdrawal_persons.id |
| `withdrawal_date` | timestamptz NOT NULL | default `now()` |
| `created_by` | text NOT NULL | FK → users.id |
| `created_at` | timestamptz | |

Indexes: `(withdrawal_date DESC)`, `(person_id, withdrawal_date DESC)`.

### `expenses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `provider` | text NOT NULL | free-text supplier name |
| `amount` | numeric(12,2) NOT NULL | CHECK > 0 |
| `method` | text NOT NULL | same enum as sale_payments.method |
| `card_brand_id` | int | same conditional rule as sale_payments |
| `installments` | smallint | same conditional rule as sale_payments |
| `observations` | text | nullable |
| `expense_date` | timestamptz NOT NULL | default `now()` |
| `created_by` | text NOT NULL | FK → users.id |
| `created_at` | timestamptz | |

Same CHECK constraints as `sale_payments` for method/card/installments coherence. Indexes: `(expense_date DESC)`, `(provider)`, `(method, expense_date DESC)`.

## Aggregation Queries (sketch)

### Daily totals (sales)

```sql
SELECT
  date_trunc('day', s.sale_date) AS day,
  SUM(s.total_amount) AS sales_total,
  SUM(CASE WHEN sp.method = 'efectivo'      THEN sp.amount ELSE 0 END) AS cash_total,
  SUM(CASE WHEN sp.method = 'transferencia' THEN sp.amount ELSE 0 END) AS transfer_total,
  SUM(CASE WHEN sp.method = 'debito'        THEN sp.amount ELSE 0 END) AS debit_total,
  SUM(CASE WHEN sp.method = 'credito' AND sp.installments = 1 THEN sp.amount ELSE 0 END) AS credit_1_total,
  SUM(CASE WHEN sp.method = 'credito' AND sp.installments = 3 THEN sp.amount ELSE 0 END) AS credit_3_total,
  SUM(CASE WHEN sp.method = 'credito' AND sp.installments = 6 THEN sp.amount ELSE 0 END) AS credit_6_total
FROM sales s
JOIN sale_payments sp ON sp.sale_id = s.id
WHERE s.sale_date >= $start AND s.sale_date < $end
GROUP BY 1
ORDER BY 1 DESC;
```

`SUM(s.total_amount)` over a join multiplies — be careful. Use either:
- A scalar subquery on `sales` for the sales_total, then join `sale_payments` separately.
- Or compute `sales_total` from `SUM(sp.amount)` (mathematically equal because of the sum invariant).

Monthly = `date_trunc('month', ...)`. Annual report shows one row per month within the selected year.

## Alternatives Considered

- **Single `sales` row with JSONB `payments` column** — rejected. Querying totals per method becomes ugly, no FK to `card_brands`, harder constraints. Relational won.
- **Postgres ENUM types for `method`** — viable, but Drizzle handles `text` + CHECK constraint with less migration friction.
- **`payment_methods` lookup table** — overkill. Four fixed values, hardcoded enum is simpler.
- **Soft-delete via `deleted_at` on sales/withdrawals/expenses** — deferred to V2. MVP allows hard delete (admin only) with audit logged in `10-MEMORY.md` future entries.
- **Storing amounts as cents (integer)** — defensible, but `numeric(12,2)` with Postgres avoids float pitfalls and is what every accountant on the planet expects. Going with numeric.
