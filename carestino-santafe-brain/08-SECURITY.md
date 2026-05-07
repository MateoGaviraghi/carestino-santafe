# Security

> Threat model, authentication, authorization, and the rules that prevent the cashier from seeing what they shouldn't.

## Threat Model

This is an internal tool with two known users (Mariano + cashier). The realistic threats are:

1. **Privilege escalation** — cashier finding a way to see/edit data they shouldn't.
2. **Stolen session** — laptop left open, someone walks up and acts as Mariano.
3. **Direct DB access** — leaked `DATABASE_URL` letting someone bypass the app entirely.
4. **Form tampering** — modified client payload bypasses zod, e.g. `totalAmount: "0"` with real payments below.
5. **Mass exfiltration via export** — cashier exporting more than the daily sheet.

Out of scope:
- Public attacks (no public surface beyond `/sign-in`).
- Sophisticated threat actors (this is not a high-value target).

## Authentication

- **Clerk** handles sign-in, sign-out, password reset, MFA.
- Sessions are JWTs in HTTP-only cookies, validated on every request via Clerk's middleware.
- Mariano onboards in person; new employees get an email invite from Clerk Dashboard or via the in-app `/config/employees` (which calls Clerk's API).
- **Recommend MFA on Mariano's account** from day 1. Free in Clerk.

## Authorization (RBAC)

Roles live in **Clerk `publicMetadata.role`** and are mirrored to `users.role` for FK convenience. Source of truth = Clerk.

### Permission Matrix

| Action | super_admin (Mariano) | cajero |
|---|:-:|:-:|
| Sign in | ✅ | ✅ |
| Create sale | ✅ | ✅ |
| Edit/delete sale | ✅ | ❌ |
| View daily sales sheet | ✅ | ✅ (read-only) |
| View monthly/annual sales sheets | ✅ | ❌ |
| Export sales (daily) | ✅ | ✅ |
| Export sales (monthly/annual) | ✅ | ❌ |
| Create withdrawal | ✅ | ✅ |
| Edit/delete withdrawal | ✅ | ❌ |
| View any withdrawal sheet | ✅ | ❌ |
| Create/edit/delete expense | ✅ | ❌ |
| View expense list | ✅ | ❌ |
| Manage employees | ✅ | ❌ |
| Manage withdrawal persons | ✅ | ❌ |
| Manage card brands | ✅ | ❌ |

### Enforcement Rules

1. **Server-side first.** Every Server Action and Route Handler starts with:
   ```ts
   const { userId, sessionClaims } = await auth();
   if (!userId) throw new Error('unauthorized');
   const role = sessionClaims.publicMetadata.role;
   requireRole(role, allowedRoles);
   ```
2. **Client-side hides UI but never enforces.** A removed sidebar link is convenience, not security.
3. **Middleware** (`middleware.ts`) blocks unauthenticated access to all routes except `/sign-in` and `/api/webhooks/clerk`.
4. **Route segment config** (`layout.tsx` per section) checks role and 403s if cashier hits an admin-only route directly.

## Validation (defense in depth)

For every mutating endpoint:

1. **Client form** — zod schema runs on submit.
2. **Server Action** — same zod schema re-runs (client untrusted).
3. **Drizzle insert** — typed at compile time.
4. **Postgres CHECK constraints + trigger** — last line of defense for the sum invariant.

## Secrets

- All secrets in Vercel encrypted env. Never in the repo.
- `.env.local` is git-ignored. `.env.example` lists keys without values.
- `CLERK_WEBHOOK_SECRET` validates incoming webhooks; reject unsigned payloads.
- `DATABASE_URL` rotation: generate new connection string in Neon, swap in Vercel, redeploy. Quarterly rotation recommended.

## Webhooks

`/api/webhooks/clerk` keeps the local `users` mirror in sync. Verify Svix signature on every call, reject otherwise.

## Audit Trail

MVP: every row carries `created_by` and `created_at`. Edits are destructive (overwrite). For a full audit log (who changed what, when), see V2 in `11-ROADMAP.md`.

## Data Retention & Privacy

- No PII beyond user email and display name. No customer data.
- All amounts are business data, not personal. Argentina LPDP compliance is light at this scale.
- Right-to-erasure: deleting a user keeps their sales/withdrawals/expenses but `created_by` becomes a tombstone reference. Acceptable for an internal tool.

## Recommended Hardening Beyond MVP

- Sentry user feedback widget for errors.
- Rate limit `/sign-in` (Clerk does this by default).
- Content Security Policy header via `next.config.js`.
- Hard-delete confirmation modal with a typed confirmation ("ELIMINAR") for destructive admin actions.

## Recommended skill

When stress-testing the implementation later: invoke `/security-review` to audit the actual code against this document.

## Alternatives Considered

- **Postgres RLS (Row-Level Security)** — strong defense, but adds complexity for a 2-role system where all enforcement is already at the action layer. Revisit if the role count grows.
- **Read-only DB user for the app** for read paths — premature. Single user is fine until there's a reason to split.
