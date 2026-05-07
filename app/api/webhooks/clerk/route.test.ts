/**
 * Integration tests for the Clerk webhook handler.
 *
 * Hits the real Neon DB scoped to ids prefixed `__test_webhook_`. Each test
 * cleans up that prefix before/after to stay idempotent.
 *
 * The CLERK_WEBHOOK_SECRET is overridden to a known value so we can sign
 * payloads with svix and verify the handler accepts/rejects them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Webhook } from 'svix';
import { sql as drizzleSql, eq, like } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { POST } from './route';

// A whsec_ secret with valid base64 body — needed for svix to accept it.
const TEST_SECRET = 'whsec_dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MA==';
const TEST_ID_PREFIX = '__test_webhook_';

const db = getDb();

async function cleanup() {
  await db.delete(users).where(like(users.id, `${TEST_ID_PREFIX}%`));
}

function buildSignedRequest(payload: object): Request {
  const body = JSON.stringify(payload);
  const wh = new Webhook(TEST_SECRET);
  const id = 'msg_test_' + Math.random().toString(36).slice(2);
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, body);
  return new Request('https://example.test/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': signature,
    },
    body,
  });
}

beforeAll(() => {
  process.env.CLERK_WEBHOOK_SECRET = TEST_SECRET;
});

beforeEach(cleanup);
afterAll(cleanup);

describe('POST /api/webhooks/clerk', () => {
  it('returns 400 when svix headers are missing', async () => {
    const req = new Request('https://example.test/api/webhooks/clerk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'user.created', data: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('missing_svix_headers');
  });

  it('returns 401 when signature is invalid', async () => {
    const req = new Request('https://example.test/api/webhooks/clerk', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_x',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,invalid',
      },
      body: JSON.stringify({ type: 'user.created', data: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('invalid_signature');
  });

  it('upserts a user.created event into the users table', async () => {
    const id = `${TEST_ID_PREFIX}created`;
    const req = buildSignedRequest({
      type: 'user.created',
      data: {
        id,
        first_name: 'Carestino',
        last_name: 'Test',
        username: null,
        primary_email_address_id: 'idn_1',
        email_addresses: [{ id: 'idn_1', email_address: 'test+create@local' }],
        public_metadata: { role: 'super_admin' },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const row = await db.select().from(users).where(eq(users.id, id));
    expect(row).toHaveLength(1);
    const user = row[0]!;
    expect(user.displayName).toBe('Carestino Test');
    expect(user.email).toBe('test+create@local');
    expect(user.role).toBe('super_admin');
    expect(user.isActive).toBe(true);
  });

  it('updates the existing row on user.updated (upsert)', async () => {
    const id = `${TEST_ID_PREFIX}updated`;
    // Seed initial row.
    await db.insert(users).values({
      id,
      email: 'old@local',
      displayName: 'Old Name',
      role: 'cajero',
      isActive: true,
    });
    const req = buildSignedRequest({
      type: 'user.updated',
      data: {
        id,
        first_name: 'New',
        last_name: 'Name',
        primary_email_address_id: 'idn_2',
        email_addresses: [{ id: 'idn_2', email_address: 'new@local' }],
        public_metadata: { role: 'cajero' },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const row = await db.select().from(users).where(eq(users.id, id));
    expect(row).toHaveLength(1);
    const user = row[0]!;
    expect(user.email).toBe('new@local');
    expect(user.displayName).toBe('New Name');
  });

  it('defaults role to "cajero" when publicMetadata.role is missing', async () => {
    const id = `${TEST_ID_PREFIX}default_role`;
    const req = buildSignedRequest({
      type: 'user.created',
      data: {
        id,
        first_name: 'No',
        last_name: 'Role',
        primary_email_address_id: 'idn_3',
        email_addresses: [{ id: 'idn_3', email_address: 'norole@local' }],
        public_metadata: {},
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const row = await db.select().from(users).where(eq(users.id, id));
    expect(row[0]!.role).toBe('cajero');
  });

  it('soft-deletes (is_active=false) on user.deleted', async () => {
    const id = `${TEST_ID_PREFIX}deleted`;
    await db.insert(users).values({
      id,
      email: 'todelete@local',
      displayName: 'Will Be Deactivated',
      role: 'cajero',
      isActive: true,
    });
    const req = buildSignedRequest({
      type: 'user.deleted',
      data: { id, deleted: true },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const row = await db.select().from(users).where(eq(users.id, id));
    expect(row).toHaveLength(1);
    expect(row[0]!.isActive).toBe(false);
  });

  it('ignores unknown event types with 200', async () => {
    const req = buildSignedRequest({
      type: 'session.created',
      data: { id: 'sess_1' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe('session.created');
  });
});

// Suppress unused import warning — drizzleSql is reserved for future debugging.
void drizzleSql;
