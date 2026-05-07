# Overview — Carestino Santa Fe Brain

> Internal management system replacing the paper logbook used to track daily sales, cash withdrawals, and expenses for a single retail location in Santa Fe, Argentina.

## Problem

The owner currently records every sale on a paper sheet with columns for total amount, payment method (cash, transfer, debit, credit 1/3/6 installments), and a side column for cash withdrawals. The format is error-prone, hard to total, impossible to filter, and contains no expense tracking. Monthly reconciliation is manual and slow.

## Goals

1. Replace the paper sheet with a web app that captures every sale, withdrawal, and expense with no ambiguity.
2. Provide instant daily / monthly / annual aggregations per payment method.
3. Allow filtering, searching, and exporting (Excel / PDF) of any view.
4. Restrict edit access to the owner; cashier role can only create entries.
5. Ship a working MVP in 2 weeks with the daily sales flow live.

## Success Criteria

- Owner stops using paper. Entire month of operation logged digitally.
- Daily reconciliation drops from ~30min to under 5min.
- Mixed-payment sales (e.g. partial cash + partial card) are recorded correctly with sum validation.
- Monthly export (Excel / PDF) is one click from any view.
- Cashier can log a sale in under 15 seconds on a desktop browser.

## Non-Goals

- No mobile-native app (web responsive is enough).
- No offline mode (the location has stable internet).
- No POS integration, no barcode scanning, no inventory.
- No payment processor integration (Mercado Pago, Getnet, etc.).
- No commission / net-revenue calculation. The system shows gross sums per method only.
- No multi-location support. Single tenant, single location.
- No customer database, no CRM.
- No historical data migration. Starts from zero.

## Key Stakeholders

- **Mariano** — owner, super admin. Uses the full system daily.
- **Cashier (carestino)** — restricted role. Logs sales and withdrawals; views the daily sales sheet read-only.
- Future hires (added by Mariano via Clerk admin UI) — same cashier role by default.
