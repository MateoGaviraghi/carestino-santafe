/**
 * Validator for card brand names.
 *
 * The DB has a UNIQUE constraint on `card_brands.name`; this schema enforces
 * basic shape (length, allowed chars) before the INSERT — the DB still gets
 * the final word on uniqueness, mapped to ActionError 'already_exists'.
 */
import { z } from 'zod';

export const CARD_BRAND_NAME_MAX = 50;

export const cardBrandNameSchema = z
  .string()
  .trim()
  .min(1, 'requerido')
  .max(CARD_BRAND_NAME_MAX, 'demasiado_largo')
  .regex(/^[A-Za-z0-9 áéíóúÁÉÍÓÚñÑ.\-/]+$/, 'caracteres_invalidos');

export type CardBrandName = z.infer<typeof cardBrandNameSchema>;
