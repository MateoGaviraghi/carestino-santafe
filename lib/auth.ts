import { auth } from '@clerk/nextjs/server';

export type Role = 'super_admin' | 'cajero';

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('forbidden');
    this.name = 'ForbiddenError';
  }
}

type SessionMetadata = {
  role?: Role;
};

export type SessionUser = {
  userId: string;
  role: Role;
};

/**
 * Read the current Clerk session and return the authenticated user + role.
 * Throws UnauthorizedError if not signed in, ForbiddenError if no role set.
 *
 * Source of truth for the role is Clerk `publicMetadata.role`. The local
 * `users.role` mirror exists only for FK ergonomics (see 04-DATA-MODEL.md).
 */
export async function getSessionUser(): Promise<SessionUser> {
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new UnauthorizedError();

  const metadata = (sessionClaims?.publicMetadata ?? {}) as SessionMetadata;
  const role = metadata.role;
  if (role !== 'super_admin' && role !== 'cajero') {
    throw new ForbiddenError();
  }
  return { userId, role };
}

/**
 * Server-side role gate. Use at the start of every Server Action / Route Handler
 * that performs a privileged operation. See 08-SECURITY.md.
 */
export async function requireRole(allowed: readonly Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!allowed.includes(user.role)) throw new ForbiddenError();
  return user;
}
