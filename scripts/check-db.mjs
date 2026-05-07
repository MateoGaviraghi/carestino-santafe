import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const sql = neon(url);

const EXPECTED_TABLES = ['users', 'card_brands', 'sales', 'sale_payments'];
const EXPECTED_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Naranja'];

let ok = true;
const fail = (msg) => {
  console.log(`✗ ${msg}`);
  ok = false;
};
const pass = (msg) => console.log(`✓ ${msg}`);

// 1. Connection
try {
  const r = await sql`SELECT current_database() AS db, version() AS pg`;
  pass(`connection OK   db=${r[0].db}   pg=${r[0].pg.split(' ').slice(0, 2).join(' ')}`);
} catch (e) {
  fail(`connection FAIL   ${e.message}`);
  process.exit(1);
}

// 2. Tables
const tables = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename = ANY(${EXPECTED_TABLES})
  ORDER BY tablename
`;
const presentTables = tables.map((t) => t.tablename);
for (const expected of EXPECTED_TABLES) {
  if (presentTables.includes(expected)) pass(`table ${expected} present`);
  else fail(`table ${expected} MISSING`);
}

// 3. Sum invariant function + trigger
const fn = await sql`
  SELECT proname FROM pg_proc WHERE proname = 'assert_sale_payments_sum'
`;
if (fn.length > 0) pass('function assert_sale_payments_sum present');
else fail('function assert_sale_payments_sum MISSING');

const trg = await sql`
  SELECT t.tgname, t.tgdeferrable, t.tginitdeferred
  FROM pg_trigger t
  WHERE t.tgname = 'trg_assert_sale_payments_sum'
`;
if (trg.length === 0) {
  fail('trigger trg_assert_sale_payments_sum MISSING');
} else {
  pass(`trigger trg_assert_sale_payments_sum present (deferrable=${trg[0].tgdeferrable} initially_deferred=${trg[0].tginitdeferred})`);
  if (!trg[0].tgdeferrable || !trg[0].tginitdeferred) {
    fail('trigger is not DEFERRABLE INITIALLY DEFERRED — sum invariant will break parent+child inserts in same tx');
  }
}

// 4. Seed
const brands = await sql`
  SELECT name FROM card_brands WHERE name = ANY(${EXPECTED_BRANDS}) ORDER BY name
`;
const presentBrands = brands.map((b) => b.name);
for (const expected of EXPECTED_BRANDS) {
  if (presentBrands.includes(expected)) pass(`card_brand "${expected}" seeded`);
  else fail(`card_brand "${expected}" NOT seeded`);
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nFAILED');
process.exit(ok ? 0 : 1);
