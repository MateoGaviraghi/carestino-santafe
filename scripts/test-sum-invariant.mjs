/**
 * Smoke test for the sum-invariant trigger.
 *
 * Validates that:
 *   - A sale with payments summing to total_amount inserts cleanly.
 *   - A sale with payments NOT summing to total_amount is rejected with
 *     SQLSTATE 'P5001' (custom code we set in the trigger).
 *
 * Uses a temporary user (id='__test_sum_invariant__'). Cleans up at the end
 * — the user delete cascades through sales → sale_payments.
 */
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const sql = neon(url);

const TEST_USER_ID = '__test_sum_invariant__';
let ok = true;
const fail = (msg) => {
  console.log(`✗ ${msg}`);
  ok = false;
};
const pass = (msg) => console.log(`✓ ${msg}`);

async function cleanup() {
  // Sales reference users via FK without cascade, so delete sales first.
  await sql`DELETE FROM sales WHERE created_by = ${TEST_USER_ID}`;
  await sql`DELETE FROM users WHERE id = ${TEST_USER_ID}`;
}

try {
  await cleanup();

  // Insert test user.
  await sql`
    INSERT INTO users (id, email, display_name, role, is_active)
    VALUES (${TEST_USER_ID}, 'test@invariant.local', 'Sum Invariant Test', 'super_admin', true)
  `;

  // ---------------------------------------------------------------------------
  // Case 1: valid sale (single cash payment, sum == total).
  // Expected: insert succeeds and the trigger does NOT fire an exception.
  // We use a CTE so the parent INSERT and child INSERT happen in one statement
  // (one implicit transaction), letting the DEFERRABLE trigger evaluate at the
  // end of the statement when the sum already matches.
  // ---------------------------------------------------------------------------
  try {
    const r = await sql`
      WITH new_sale AS (
        INSERT INTO sales (total_amount, created_by)
        VALUES ('1000.00', ${TEST_USER_ID})
        RETURNING id
      )
      INSERT INTO sale_payments (sale_id, method, amount, card_brand_id, installments)
      SELECT id, 'efectivo', '1000.00', NULL, NULL FROM new_sale
      RETURNING id
    `;
    if (r.length === 1) pass('case 1 — valid sale (sum=total) inserted cleanly');
    else fail(`case 1 — expected 1 row inserted, got ${r.length}`);
  } catch (e) {
    fail(`case 1 — should have succeeded but raised: ${e.message}`);
  }

  // ---------------------------------------------------------------------------
  // Case 2: invalid sale (payment amount != total).
  // Expected: trigger rejects with SQLSTATE 'P5001' and message includes
  // 'sum_mismatch'.
  // ---------------------------------------------------------------------------
  try {
    await sql`
      WITH new_sale AS (
        INSERT INTO sales (total_amount, created_by)
        VALUES ('1000.00', ${TEST_USER_ID})
        RETURNING id
      )
      INSERT INTO sale_payments (sale_id, method, amount, card_brand_id, installments)
      SELECT id, 'efectivo', '500.00', NULL, NULL FROM new_sale
      RETURNING id
    `;
    fail('case 2 — should have raised sum_mismatch but insert succeeded');
  } catch (e) {
    const msg = e.message ?? '';
    const code = e.code ?? e.cause?.code;
    if (code === 'P5001' || msg.includes('sum_mismatch')) {
      pass(`case 2 — sum mismatch correctly rejected (code=${code ?? '?'} msg="${msg.split('\n')[0]}")`);
    } else {
      fail(`case 2 — wrong error: code=${code ?? '?'} msg="${msg}"`);
    }
  }
} finally {
  await cleanup();
}

console.log(ok ? '\nSUM INVARIANT OK' : '\nSUM INVARIANT FAILED');
process.exit(ok ? 0 : 1);
