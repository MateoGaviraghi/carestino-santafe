import Image from 'next/image';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';

type SessionPublicMetadata = { role?: string };

export default async function HomePage() {
  const { userId, sessionClaims } = await auth();
  const metadata = (sessionClaims?.publicMetadata ?? {}) as SessionPublicMetadata;
  const role = metadata.role ?? null;
  const roleOk = role === 'super_admin';

  return (
    <main className="relative min-h-screen bg-background">
      {/* User avatar — only when signed in, anchored top-right for sign-out access */}
      <SignedIn>
        <div className="absolute right-6 top-6">
          <UserButton />
        </div>
      </SignedIn>

      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <Image
            src="/logo-nombre.png"
            alt="Carestino"
            width={400}
            height={100}
            priority
            className="h-20 w-auto"
          />

          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
            Santa Fe — Sistema interno
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gestión de ventas, retiros y gastos.
          </p>

          <SignedOut>
            <SignInButton mode="modal">
              <button className="mt-8 rounded-input bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                Iniciar sesión
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <div className="mt-8 w-full rounded-card border border-border bg-card p-5 text-left">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sesión activa
              </div>
              <dl className="space-y-2 text-sm tabular-nums">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">userId</dt>
                  <dd className="truncate font-mono text-xs">{userId}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">role</dt>
                  <dd>
                    <span
                      className={
                        roleOk
                          ? 'rounded-input bg-success px-2 py-0.5 text-xs font-medium text-success-foreground'
                          : 'rounded-input bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground'
                      }
                    >
                      {role ?? 'sin rol'}
                    </span>
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {roleOk
                  ? 'JWT custom claim configurado correctamente.'
                  : 'Falta setear publicMetadata.role = "super_admin" en Clerk.'}
              </p>
            </div>
          </SignedIn>
        </div>
      </div>
    </main>
  );
}
