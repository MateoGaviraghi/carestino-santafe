import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(url);

const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Naranja'];

async function seedCardBrands() {
  let inserted = 0;
  let existed = 0;
  for (const name of CARD_BRANDS) {
    const result = await sql`
      INSERT INTO card_brands (name, is_active)
      VALUES (${name}, true)
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    `;
    if (result.length > 0) {
      inserted += 1;
    } else {
      existed += 1;
    }
  }
  console.log(`card_brands: inserted=${inserted}  existed=${existed}  total=${CARD_BRANDS.length}`);
}

await seedCardBrands();
console.log('seed: OK');
