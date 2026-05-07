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
