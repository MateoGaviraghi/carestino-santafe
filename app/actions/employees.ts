'use server';

/**
 * Employee management Server Actions (V1) — super_admin only.
 *
 * Source of truth for the role lives in Clerk publicMetadata; the DB
 * users table mirrors it (D-014). Each action updates Clerk first, then
 * keeps the local row in sync. Webhook still runs in the background as a
 * safety net.
 *
 * Self-edit guard: the action refuses to mutate the calling user's own
 * role or active state — prevents a super_admin from accidentally
 * locking themselves out.
 */
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';

import { getDb } from '@/db';
import { users, type Role } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  type SessionUser,
} from '@/lib/auth';
import {
  createEmployeeSchema,
  setEmployeeRoleSchema,
  type CreateEmployeeInput,
  type SetEmployeeRoleInput,
} from '@/lib/validators/employee';

export type EmployeeActionError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'self_edit_blocked'
  | 'already_exists'
  | 'not_found'
  | 'clerk_error'
  | 'internal_error';

export type EmployeeActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EmployeeActionError; message?: string };

const REVALIDATE_PATHS = ['/configuracion/empleados', '/'];

function mapZodError(e: ZodError): EmployeeActionResult<never> {
  return {
    ok: false,
    error: 'validation_error',
    message: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

async function gateAdmin(): Promise<
  | { ok: false; error: 'unauthorized' | 'forbidden' }
  | { user: SessionUser }
> {
  try {
    const user = await requireRole(['super_admin']);
    return { user };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }
}

/** Best-effort message extraction from a Clerk SDK error. */
function clerkErrorMessage(e: unknown): string {
  if (typeof e !== 'object' || e === null) return 'Error desconocido';
  const err = e as {
    errors?: Array<{ message?: string; longMessage?: string }>;
    message?: string;
  };
  if (err.errors?.length) {
    return err.errors.map((x) => x.longMessage ?? x.message ?? '').filter(Boolean).join('; ');
  }
  return err.message ?? 'Error desconocido';
}

function isClerkAlreadyExists(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { errors?: Array<{ code?: string }> };
  return Boolean(
    err.errors?.some(
      (x) => x.code === 'form_identifier_exists' || x.code === 'form_username_invalid_already_taken',
    ),
  );
}

// -----------------------------------------------------------------------------
// addEmployee — creates a Clerk user + mirrors into the users table.
// -----------------------------------------------------------------------------

export async function addEmployee(
  input: unknown,
): Promise<EmployeeActionResult<{ userId: string }>> {
  const gated = await gateAdmin();
  if ('ok' in gated && gated.ok === false) return gated;

  let parsed: CreateEmployeeInput;
  try {
    parsed = createEmployeeSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  const client = await clerkClient();
  let createdId: string;
  try {
    const created = await client.users.createUser({
      emailAddress: [parsed.email],
      password: parsed.password,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      publicMetadata: { role: parsed.role },
    });
    createdId = created.id;
  } catch (e) {
    if (isClerkAlreadyExists(e)) {
      return {
        ok: false,
        error: 'already_exists',
        message: 'Ya existe un usuario con ese email.',
      };
    }
    return {
      ok: false,
      error: 'clerk_error',
      message: clerkErrorMessage(e),
    };
  }

  // Mirror locally so the new employee shows up in the table immediately
  // (the webhook will arrive later but we don't want to wait for it).
  const displayName =
    [parsed.firstName, parsed.lastName].filter(Boolean).join(' ').trim() || null;
  const db = getDb();
  try {
    await db
      .insert(users)
      .values({
        id: createdId,
        email: parsed.email,
        displayName,
        role: parsed.role,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: parsed.email,
          displayName,
          role: parsed.role,
          isActive: true,
        },
      });
  } catch (e) {
    console.error('addEmployee local mirror failed:', e);
    // Clerk side already created — don't roll back. The webhook can
    // reconcile if needed. Surface a soft warning to the caller.
    return {
      ok: false,
      error: 'internal_error',
      message: 'Usuario creado en Clerk pero falló el espejo local.',
    };
  }

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, data: { userId: createdId } };
}

// -----------------------------------------------------------------------------
// setEmployeeRole — flip between super_admin and cajero.
// -----------------------------------------------------------------------------

export async function setEmployeeRole(
  input: unknown,
): Promise<EmployeeActionResult<void>> {
  const gated = await gateAdmin();
  if ('ok' in gated && gated.ok === false) return gated;
  const session = (gated as { user: SessionUser }).user;

  let parsed: SetEmployeeRoleInput;
  try {
    parsed = setEmployeeRoleSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  if (parsed.userId === session.userId) {
    return {
      ok: false,
      error: 'self_edit_blocked',
      message: 'No podés cambiar tu propio rol — pedile a otro super_admin.',
    };
  }

  const client = await clerkClient();
  try {
    await client.users.updateUserMetadata(parsed.userId, {
      publicMetadata: { role: parsed.role },
    });
  } catch (e) {
    return { ok: false, error: 'clerk_error', message: clerkErrorMessage(e) };
  }

  const db = getDb();
  try {
    const updated = await db
      .update(users)
      .set({ role: parsed.role as Role })
      .where(eq(users.id, parsed.userId))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return { ok: false, error: 'not_found' };
    }
  } catch (e) {
    console.error('setEmployeeRole local mirror failed:', e);
    return { ok: false, error: 'internal_error' };
  }

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, data: undefined };
}

// -----------------------------------------------------------------------------
// setEmployeeActive — ban / unban in Clerk + flip is_active locally.
// -----------------------------------------------------------------------------

export async function setEmployeeActive(
  userId: string,
  isActive: boolean,
): Promise<EmployeeActionResult<void>> {
  const gated = await gateAdmin();
  if ('ok' in gated && gated.ok === false) return gated;
  const session = (gated as { user: SessionUser }).user;

  if (typeof userId !== 'string' || userId.length === 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }
  if (userId === session.userId) {
    return {
      ok: false,
      error: 'self_edit_blocked',
      message: 'No podés desactivar tu propia cuenta.',
    };
  }

  const client = await clerkClient();
  try {
    if (isActive) {
      await client.users.unbanUser(userId);
    } else {
      await client.users.banUser(userId);
    }
  } catch (e) {
    return { ok: false, error: 'clerk_error', message: clerkErrorMessage(e) };
  }

  const db = getDb();
  try {
    const updated = await db
      .update(users)
      .set({ isActive })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return { ok: false, error: 'not_found' };
    }
  } catch (e) {
    console.error('setEmployeeActive local mirror failed:', e);
    return { ok: false, error: 'internal_error' };
  }

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, data: undefined };
}
