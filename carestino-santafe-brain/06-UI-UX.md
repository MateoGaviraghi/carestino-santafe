# UI / UX

> Layout, design tokens, key flows, and the rules that make a sale-entry under 15 seconds.

## Design Principles

1. **Speed over beauty.** This is internal. Form fields focus in a logical order, Enter submits, errors are inline and instant.
2. **Two-handed cashier mode.** Keyboard-first. Tab/Shift-Tab through the form, Enter to save, Esc to clear.
3. **Numbers are the hero.** Analytics cards above every sheet show the totals at a glance — that's why the owner stops using paper.
4. **Read-only is visually distinct.** Cashier sees the daily sheet without edit affordances (no row hover actions, no edit/delete icons).

## Tokens (shadcn defaults + small overrides)

- **Font:** Geist (default Next.js).
- **Colors:** shadcn neutral palette in light mode. Brand accent: a single `--accent` (defined per Carestino brand later — placeholder slate-900 in MVP).
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48 px scale.
- **Radius:** 8px on cards, 6px on inputs and buttons.
- **Typography:** 14px base, 12px tabular-nums for amount columns, 24px for analytics card values.
- **Motion:** 150ms default, 250ms for full-card transitions. No bounces.

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (collapsible on tablet)   │   Page             │
│  ────────────────────────          │                    │
│  ▸ Ventas                          │   <route content>  │
│      Nueva                         │                    │
│      Planilla diaria               │                    │
│      Mensual           (admin)     │                    │
│      Anual             (admin)     │                    │
│  ▸ Retiros             (admin)     │                    │
│      Nuevo             (cajero++)  │                    │
│      Diaria/Mensual/Anual          │                    │
│  ▸ Gastos              (admin)     │                    │
│      Nuevo                         │                    │
│      Lista                         │                    │
│  ▸ Configuración       (admin)     │                    │
│      Empleados                     │                    │
│      Personas que retiran          │                    │
│      Marcas de tarjeta             │                    │
└─────────────────────────────────────────────────────────┘
```

Cashier view collapses to: **Nueva venta**, **Nuevo retiro**, **Planilla diaria** — nothing else.

## Key Flows

### Flow 1 — Create Sale (cashier, default flow)

```
[Total amount]  ← autofocus
[+ Add payment method]   default: 1 row, method=efectivo, amount=total
   ┌─ method (select)
   ├─ amount (number)
   ├─ card brand (visible only if debito|credito)
   └─ installments (visible only if credito)
[Observations]   optional
[Save]   keyboard: Enter
```

- Form opens with one payment row pre-filled with the total in cash. 80% of sales are single-method; this saves clicks.
- Adding a second row auto-recomputes the remaining unallocated amount and pre-fills it.
- Live "Restante: $X" indicator turns green when it hits 0, red otherwise.
- Save disabled while `restante !== 0`.
- On success: toast confirmation, form resets, focus returns to total amount. Ready for next sale.

### Flow 2 — Daily Sales Sheet (read for cashier, full for admin)

Top section — **analytics cards** (one row, scrollable on mobile):

```
Ventas total | Efectivo | Transferencia | Débito | Crédito 1 | Crédito 3 | Crédito 6
   $104,200   $74,000     $12,000        $8,200     $5,000      $3,000      $2,000
```

Below — **table** with one row per sale:

```
Hora | Total | Métodos (chips)                         | Observaciones | (admin: actions)
14:23  $4,500   [Efectivo $2,500] [Crédito Visa 3c $2,000]   "..."
```

- Default sort: most recent first.
- Filters: method, card brand, installments, search in observations.
- Export buttons (Excel / PDF) above the table, right-aligned.

### Flow 3 — Monthly / Annual Sheets (admin only)

Same shape, but each row is **one day** (monthly) or **one month** (annual) with aggregated columns:

```
Día | Ventas total | Efectivo | Transferencia | Débito | Crédito 1 | Crédito 3 | Crédito 6
01    $104,200      $74,000    $12,000         $8,200   $5,000      $3,000      $2,000
02    ...
```

Click a row → drills down to that day's daily sheet.

### Flow 4 — Withdrawal (cashier or admin)

```
[Amount]
[Person]   select from withdrawal_persons (active only)
[Save]
```

Three fields, one screen. Submitted in <5 seconds.

### Flow 5 — Expense (admin only)

Like the sale form but single-payment (no split):

```
[Provider]   text
[Amount]
[Method]     select
[Card brand] visible if debito|credito
[Installments] visible if credito
[Observations]
[Save]
```

### Flow 6 — Expenses List (admin only)

One unified list. Filters at the top: provider (autocomplete), method, card brand, installments, date range, free-text search. Export Excel/PDF.

## Filters & Search (consistent across sheets)

Every sheet has the same filter row:

- **Date range** (or period selector for daily/monthly/annual sheets).
- **Search** — free text across observations / provider.
- **Method** — multi-select.
- **Card brand** — multi-select, visible only when method includes debito/credito.
- **Installments** — multi-select, visible only when method includes credito.
- **Clear filters** button.

Filters are URL-driven (search params). Refresh keeps them. Share link → same view.

## Export UX

- Two buttons, always together: `[Export Excel]` `[Export PDF]`.
- Exports respect the **current filters and date range** of the view.
- Filename pattern: `ventas-diaria-2026-04-28.xlsx`, `gastos-2026-04-01_2026-04-30.pdf`.
- PDF includes the analytics cards as a header block, then the table.

## Empty / Error / Loading States

- **Empty:** "No hay ventas registradas para esta fecha. [Nueva venta]" — primary CTA.
- **Error:** inline banner with retry. Sentry/log on the server, friendly message on the client.
- **Loading:** skeleton rows for tables, spinner on submit buttons. No full-page loaders.

## Accessibility

- All interactive elements keyboard-accessible (shadcn primitives via Radix already comply).
- Color contrast WCAG AA.
- Form errors announced via `aria-live`.
- Tabular numbers (`font-variant-numeric: tabular-nums`) on every amount column for vertical alignment.

## Recommended skill

For animations / micro-interactions on form success, totals counters, and route transitions: invoke `/animate` once the MVP shell is up. For an accessibility audit before launch, invoke `/accessibility-review`.

## Alternatives Considered

- **Top nav instead of sidebar** — sidebar wins because the role-based menu list is short and stable, easy to scan vertically.
- **Modal forms instead of dedicated routes** — routes win because Server Actions + revalidation are simpler with full-page forms; modals add state-management cost for no UX gain.
- **One mega "transactions" table mixing sales/withdrawals/expenses** — rejected. Different shapes, different roles. Three sheets keep mental models clean.
- **Dark mode in MVP** — deferred. Internal tool, single environment. Add when someone asks.
