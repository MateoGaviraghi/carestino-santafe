import { eq, asc } from 'drizzle-orm';
import { getDb } from '@/db';
import { cardBrands, type CardBrand } from '@/db/schema';

export type CardBrandOption = Pick<CardBrand, 'id' | 'name'>;

export async function listActiveCardBrands(): Promise<CardBrandOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: cardBrands.id, name: cardBrands.name })
    .from(cardBrands)
    .where(eq(cardBrands.isActive, true))
    .orderBy(asc(cardBrands.name));
  return rows;
}

/**
 * Full list — used by the admin config page to show inactive brands too
 * (so super_admin can re-activate one without re-creating it).
 */
export async function listAllCardBrands(): Promise<CardBrand[]> {
  const db = getDb();
  return db.select().from(cardBrands).orderBy(asc(cardBrands.isActive), asc(cardBrands.name));
}
