# Infrastructure

> Hosting, deploy flow, environment variables, and operational basics.

## Topology

| Component | Provider | Plan |
|---|---|---|
| App hosting | Vercel | Hobby (free) |
| Database | Neon | Free (1 project, 0.5 GB, scales to zero) |
| Auth | Clerk | Free (10k MAU, more than enough) |

Single region: closest Vercel/Neon region to Argentina (`gru1` São Paulo for Vercel, `aws-sa-east-1` for Neon when available; otherwise `us-east-1` is the fallback). Latency is non-critical for ~5 users.

## Environments

| Env | Branch | DB | Clerk |
|---|---|---|---|
| `production` | `main` | Neon `main` branch | Clerk production instance |
| `preview` | feature branches | Neon ephemeral branch (auto-created per Vercel preview) | Clerk development instance |
| `local` | local dev | Neon dev branch (or local Postgres via Docker) | Clerk development instance |

Neon's branching makes preview deploys safe — every PR gets a fresh DB branch.

## Environment Variables

```
# Database
DATABASE_URL=postgres://...neon.tech/...?sslmode=require           # pooled (HTTP driver)
DATABASE_URL_UNPOOLED=postgres://...neon.tech/...?sslmode=require  # for migrations

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# App
NEXT_PUBLIC_APP_URL=https://carestino-santafe-brain.vercel.app
TZ=America/Argentina/Cordoba
```

All secrets live in Vercel's encrypted environment store — never in the repo. `.env.local` is git-ignored. `.env.example` lists keys without values.

## Deploy Flow

1. Push to `main` → Vercel builds → Vercel deploys.
2. Pre-deploy step in CI: `drizzle-kit migrate` against `DATABASE_URL_UNPOOLED` (production schema sync).
3. Vercel runs `next build` then publishes.
4. Health check on `/api/health` (returns 200 if DB reachable).

PRs auto-deploy as previews with their own Neon branch. Merge to `main` deletes the Neon branch.

## Migrations

- **Tool:** `drizzle-kit`.
- **Workflow:** schema changes in `db/schema.ts` → `drizzle-kit generate` produces SQL in `drizzle/` → committed to git → applied on deploy via `drizzle-kit migrate` (CI step).
- **Rollback:** Neon supports point-in-time restore on the free tier (7 days). Most migrations are additive; destructive changes go through a 2-deploy migration (add → backfill → remove).

## Observability (free tier)

- **Logs:** Vercel function logs (retained 1 day on Hobby — acceptable for V1).
- **Errors:** add `@sentry/nextjs` early, free tier covers thousands of events/month.
- **Uptime:** UptimeRobot on the public URL — free, alerts to email.
- **DB metrics:** Neon dashboard.

## Backups

- Neon free tier: automatic 7-day point-in-time restore.
- Manual logical backup once a month via `pg_dump` to S3 or Google Drive (cron via GitHub Actions or a Vercel cron job — schedule in V1).

## Cost Forecast

| Item | Cost |
|---|---|
| Vercel Hobby | $0 |
| Neon Free | $0 |
| Clerk Free | $0 |
| Domain (optional) | ~$15/year |
| **Total** | **$0 + domain** |

If the app outgrows the free tier, upgrade triggers:

- **Vercel Pro** ($20/mo) — needed for analytics, longer log retention, team seats.
- **Neon Launch** ($19/mo) — needed for >0.5 GB, multiple projects, longer PITR.
- **Clerk paid** — never, at this scale.

## Recommended skill

When ready to ship the first deploy: invoke `/deploy-to-vercel` for a guided walkthrough.

## Alternatives Considered

- **Railway / Fly.io** — fine alternatives, more knobs, more cost. Vercel + Neon is dead-simple for Next.js.
- **Self-hosted on a VPS** — cheaper at scale, more ops work. Not worth it for ~5 users.
- **Supabase auth instead of Clerk** — would let us drop Clerk, but the user-management UI is weaker. We chose the trade-off.
