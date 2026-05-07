/**
 * Backfill the local `users` table from Clerk via Admin API.
 *
 * Use cases:
 *   - First-time bootstrap: get the existing super_admin into the DB so
 *     sales.created_by has a valid FK target before the webhook is wired
 *     (or before the production URL is reachable from Clerk).
 *   - Disaster recovery: if the webhook missed events while the deploy was
 *     down, re-running this catches everything back up.
 *   - Local dev: pull the current Clerk users into your dev DB.
 *
 * Idempotent — uses ON CONFLICT (id) DO UPDATE.
 */
import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.DATABASE_URL;
const clerkSecret = process.env.CLERK_SECRET_KEY;

if (!dbUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
if (!clerkSecret) {
  console.error('CLERK_SECRET_KEY is not set');
  process.exit(1);
}

const sql = neon(dbUrl);

const res = await fetch('https://api.clerk.com/v1/users?limit=100', {
  headers: { Authorization: `Bearer ${clerkSecret}` },
});

if (!res.ok) {
  console.error(`Clerk API returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const clerkUsers = await res.json();

if (!Array.isArray(clerkUsers)) {
  console.error('Unexpected response shape from Clerk:', clerkUsers);
  process.exit(1);
}

if (clerkUsers.length === 0) {
  console.log('No users in Clerk to backfill.');
  process.exit(0);
}

let upserted = 0;
for (const u of clerkUsers) {
  const primaryEmail = u.primary_email_address_id
    ? u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address
    : u.email_addresses?.[0]?.email_address;
  const email = primaryEmail ?? null;

  const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  const displayName = fullName.length > 0 ? fullName : (u.username ?? null);

  const metadataRole = u.public_metadata?.role;
  const role =
    metadataRole === 'super_admin' || metadataRole === 'cajero' ? metadataRole : 'cajero';

  await sql`
    INSERT INTO users (id, email, display_name, role, is_active)
    VALUES (${u.id}, ${email}, ${displayName}, ${role}, true)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      is_active = true
  `;
  upserted += 1;
  console.log(`✓ ${u.id}  role=${role}  email=${email ?? '(null)'}`);
}

console.log(`\nbackfilled ${upserted} users from Clerk`);
