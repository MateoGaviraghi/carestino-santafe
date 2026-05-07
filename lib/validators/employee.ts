/**
 * Employee management validators (V1).
 *
 * Used by addEmployee + setEmployeeRole Server Actions. Roles mirror the
 * domain enum from db/schema.ts.
 */
import { z } from 'zod';
import { ROLES } from '@/db/schema';

export const createEmployeeSchema = z.object({
  email: z.string().trim().email('email_invalido'),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  // Clerk policy decides minimums; we just enforce a sane lower bound here.
  password: z.string().min(8, 'password_corto').max(72, 'password_largo'),
  role: z.enum(ROLES).default('cajero'),
});

export const setEmployeeRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type SetEmployeeRoleInput = z.infer<typeof setEmployeeRoleSchema>;
