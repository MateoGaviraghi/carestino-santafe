import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUp, EyeOff } from 'lucide-react';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { listAllCardBrands } from '@/lib/queries/card-brands';
import { setCardBrandActive } from '@/app/actions/config';
import { CardBrandForm } from '@/components/config/card-brand-form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CardBrandsConfigPage() {
  // super_admin only — cashier should never see this even via direct URL.
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const brands = await listAllCardBrands();

  async function toggleActive(formData: FormData) {
    'use server';
    const id = Number(formData.get('id'));
    const next = formData.get('next') === 'true';
    if (Number.isInteger(id) && id > 0) {
      await setCardBrandActive(id, next);
    }
  }

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
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 font-medium">{b.name}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
                        b.isActive
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      {b.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <form action={toggleActive} className="inline">
                      <input type="hidden" name="id" value={b.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={b.isActive ? 'false' : 'true'}
                      />
                      <Button type="submit" variant="outline" size="sm">
                        {b.isActive ? (
                          <>
                            <EyeOff className="mr-1 h-3 w-3" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <ArrowUp className="mr-1 h-3 w-3" />
                            Activar
                          </>
                        )}
                      </Button>
                    </form>
                  </td>
                </tr>
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
