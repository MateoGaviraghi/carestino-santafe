/**
 * Clerk → users mirror webhook.
 *
 * Receives `user.created`, `user.updated`, `user.deleted` events from Clerk
 * (signed via Svix) and keeps the local `users` row in sync. Required so
 * that `sales.created_by` (FK → users.id) resolves for every action.
 *
 * Ordering note (G-003 in 10-MEMORY.md): Clerk does not guarantee event
 * order — always upsert, never insert. The current handler uses
 * INSERT ... ON CONFLICT DO UPDATE for safety.
 *
 * Source of truth for the role is Clerk `publicMetadata.role`. If a
 * webhook arrives before the dashboard has set a role, we default to
 * `cajero` (least privilege). The role is overwritten on every event,
 * so promoting a user in Clerk eventually propagates here.
 */
import { Webhook } from 'svix';
import { NextResponse } from 'next/server';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users, type Role } from '@/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ClerkUserData = Extract<WebhookEvent, { type: 'user.created' | 'user.updated' }>['data'];

function pickEmail(data: ClerkUserData): string | null {
  const primaryId = data.primary_email_address_id;
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === primaryId) ?? list[0];
  return primary?.email_address ?? null;
}

function pickDisplayName(data: ClerkUserData): string | null {
  const full = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  if (full.length > 0) return full;
  if (data.username) return data.username;
  return null;
}

function pickRole(data: ClerkUserData): Role {
  const metadata = (data.public_metadata ?? {}) as { role?: unknown };
  const role = metadata.role;
  if (role === 'super_admin' || role === 'cajero') return role;
  // Default new users to least privilege; admin can promote in Clerk dashboard.
  return 'cajero';
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'webhook_not_configured' },
      { status: 500 },
    );
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { ok: false, error: 'missing_svix_headers' },
      { status: 400 },
    );
  }

  const body = await req.text();
  let event: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_signature' },
      { status: 401 },
    );
  }

  const db = getDb();

  switch (event.type) {
    case 'user.created':
    case 'user.updated': {
      const data = event.data;
      const email = pickEmail(data);
      const displayName = pickDisplayName(data);
      const role = pickRole(data);
      await db
        .insert(users)
        .values({
          id: data.id,
          email,
          displayName,
          role,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, displayName, role, isActive: true },
        });
      return NextResponse.json({ ok: true, mirrored: event.type, id: data.id });
    }
    case 'user.deleted': {
      // Soft-delete to preserve FKs in historical sales/withdrawals/expenses.
      const id = event.data.id;
      if (!id) {
        return NextResponse.json({ ok: true, ignored: 'deleted_without_id' });
      }
      await db.update(users).set({ isActive: false }).where(eq(users.id, id));
      return NextResponse.json({ ok: true, deactivated: id });
    }
    default:
      // Other events (sessions, organizations, etc.) are not mirrored.
      return NextResponse.json({ ok: true, ignored: event.type });
  }
}
