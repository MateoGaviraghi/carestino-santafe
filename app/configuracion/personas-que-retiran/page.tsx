import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { listAllWithdrawalPersons } from '@/lib/queries/withdrawals';
import { WithdrawalPersonForm } from '@/components/config/withdrawal-person-form';
import { EditableNameRow } from '@/components/config/editable-name-row';

export const dynamic = 'force-dynamic';

export default async function WithdrawalPersonsConfigPage() {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const persons = await listAllWithdrawalPersons();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Personas que retiran
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Las personas activas aparecen en el formulario de retiro. Las inactivas se
          conservan para no romper retiros históricos.
        </p>
      </header>

      <section className="mb-8 rounded-card border border-border bg-card p-5">
        <WithdrawalPersonForm />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Personas existentes
        </h2>
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Nombre
                </th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Estado
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {persons.map((p) => (
                <EditableNameRow
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  isActive={p.isActive}
                  variant="withdrawal-person"
                />
              ))}
              {persons.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No hay personas cargadas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
