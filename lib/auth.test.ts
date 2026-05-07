/**
 * RBAC unit tests — covers the second non-negotiable from the spec
 * ("Server-side RBAC on every action"). We mock @clerk/nextjs/server's
 * auth() so we can exhaustively walk the role matrix without hitting
 * Clerk's network.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

const { auth } = await import('@clerk/nextjs/server');
const {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
  requireRole,
} = await import('./auth');

type AuthReturn = {
  userId: string | null;
  sessionClaims?: { publicMetadata?: { role?: unknown } } | null;
};

function mockAuth(value: AuthReturn) {
  vi.mocked(auth).mockResolvedValueOnce(value as never);
}

afterEach(() => {
  vi.mocked(auth).mockReset();
});

describe('getSessionUser', () => {
  it('throws UnauthorizedError when there is no userId', async () => {
    mockAuth({ userId: null });
    await expect(getSessionUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ForbiddenError when publicMetadata is missing', async () => {
    mockAuth({ userId: 'u_1', sessionClaims: {} });
    await expect(getSessionUser()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError when role is not super_admin or cajero', async () => {
    mockAuth({ userId: 'u_1', sessionClaims: { publicMetadata: { role: 'guest' } } });
    await expect(getSessionUser()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError when role is the wrong type', async () => {
    mockAuth({ userId: 'u_1', sessionClaims: { publicMetadata: { role: 42 } } });
    await expect(getSessionUser()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns userId + role when valid super_admin session', async () => {
    mockAuth({
      userId: 'u_admin',
      sessionClaims: { publicMetadata: { role: 'super_admin' } },
    });
    await expect(getSessionUser()).resolves.toEqual({
      userId: 'u_admin',
      role: 'super_admin',
    });
  });

  it('returns userId + role when valid cajero session', async () => {
    mockAuth({
      userId: 'u_caja',
      sessionClaims: { publicMetadata: { role: 'cajero' } },
    });
    await expect(getSessionUser()).resolves.toEqual({
      userId: 'u_caja',
      role: 'cajero',
    });
  });
});

describe('requireRole', () => {
  it('lets a super_admin pass an admin-only gate', async () => {
    mockAuth({
      userId: 'u_admin',
      sessionClaims: { publicMetadata: { role: 'super_admin' } },
    });
    const u = await requireRole(['super_admin']);
    expect(u.role).toBe('super_admin');
  });

  it('blocks a cajero from an admin-only gate (ForbiddenError)', async () => {
    mockAuth({
      userId: 'u_caja',
      sessionClaims: { publicMetadata: { role: 'cajero' } },
    });
    await expect(requireRole(['super_admin'])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets either role pass a shared gate', async () => {
    // Admin path.
    mockAuth({
      userId: 'u_admin',
      sessionClaims: { publicMetadata: { role: 'super_admin' } },
    });
    await expect(
      requireRole(['super_admin', 'cajero']),
    ).resolves.toEqual({ userId: 'u_admin', role: 'super_admin' });

    // Cajero path.
    mockAuth({
      userId: 'u_caja',
      sessionClaims: { publicMetadata: { role: 'cajero' } },
    });
    await expect(
      requireRole(['super_admin', 'cajero']),
    ).resolves.toEqual({ userId: 'u_caja', role: 'cajero' });
  });

  it('blocks a super_admin from a cashier-only gate (defensive, even if unused)', async () => {
    mockAuth({
      userId: 'u_admin',
      sessionClaims: { publicMetadata: { role: 'super_admin' } },
    });
    await expect(requireRole(['cajero'])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws UnauthorizedError when there is no session at all', async () => {
    mockAuth({ userId: null });
    await expect(
      requireRole(['super_admin', 'cajero']),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
