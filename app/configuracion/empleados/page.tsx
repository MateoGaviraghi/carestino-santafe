import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
  requireRole,
} from '@/lib/auth';
import { listAllUsers } from '@/lib/queries/users';
import { EmployeeForm } from '@/components/config/employee-form';
import { EmployeeRow } from '@/components/config/employee-row';

export const dynamic = 'force-dynamic';

export default async function EmployeesConfigPage() {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  // Need the current userId for the self-edit guard in the UI.
  const session = await getSessionUser();

  const users = await listAllUsers();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Empleados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crear nuevos empleados, cambiar su rol, activar o desactivar el acceso. Los
          empleados desactivados no pueden iniciar sesión, pero sus ventas y retiros
          históricos se conservan.
        </p>
      </header>

      <section className="mb-8 rounded-card border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agregar nuevo empleado
        </h2>
        <EmployeeForm />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Empleados existentes
        </h2>
        <div className="-mx-4 overflow-x-auto rounded-none border-y border-border sm:mx-0 sm:rounded-card sm:border"><table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Nombre / Email
                </th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rol
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
              {users.map((u) => (
                <EmployeeRow key={u.id} user={u} isSelf={u.id === session.userId} />
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No hay empleados cargados todavía.
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
