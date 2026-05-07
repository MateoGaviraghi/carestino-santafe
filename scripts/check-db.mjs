import { neon } from '@neondatabase/serverless';

const targets = [
  ['DATABASE_URL (pooled)', process.env.DATABASE_URL],
  ['DATABASE_URL_UNPOOLED (direct)', process.env.DATABASE_URL_UNPOOLED],
];

let ok = true;
for (const [name, url] of targets) {
  if (!url) {
    console.log(`${name}: MISSING`);
    ok = false;
    continue;
  }
  try {
    const sql = neon(url);
    const result = await sql`SELECT 1 AS one, current_database() AS db, version() AS pg`;
    const row = result[0];
    console.log(`${name}: OK   db=${row.db}   pg=${row.pg.split(' ').slice(0, 2).join(' ')}`);
  } catch (err) {
    console.log(`${name}: FAIL   ${err.message}`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
