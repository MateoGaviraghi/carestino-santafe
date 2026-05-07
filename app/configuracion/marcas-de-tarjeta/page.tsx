import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { listAllCardBrands } from '@/lib/queries/card-brands';
import { CardBrandForm } from '@/components/config/card-brand-form';
import { EditableNameRow } from '@/components/config/editable-name-row';

export const dynamic = 'force-dynamic';

export default async function CardBrandsConfigPage() {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const brands = await listAllCardBrands();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Marcas de tarjeta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Las marcas activas aparecen en el formulario de venta. Las inactivas se conservan
          para no romper ventas históricas.
        </p>
      </header>

      <section className="mb-8 rounded-card border border-border bg-card p-5">
        <CardBrandForm />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Marcas existentes
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
              {brands.map((b) => (
                <EditableNameRow
                  key={b.id}
                  id={b.id}
                  name={b.name}
                  isActive={b.isActive}
                  variant="card-brand"
                />
              ))}
              {brands.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No hay marcas cargadas todavía.
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
