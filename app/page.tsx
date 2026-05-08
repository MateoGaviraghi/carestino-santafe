import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SignInButton, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Decimal from 'decimal.js';
import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CreditCard,
  Plus,
  Receipt,
  ShoppingBag,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';

import { APP_TZ, dayRangeInAppTZ, todayInAppTZ } from '@/lib/dates';
import { formatARS } from '@/lib/money';
import { getDailySalesTotals } from '@/lib/queries/sales';
import { getDailyWithdrawalsTotals } from '@/lib/queries/withdrawals';
import { listExpenses } from '@/lib/queries/expenses';

export const dynamic = 'force-dynamic';

type Role = 'super_admin' | 'cajero';
type SessionPublicMetadata = { role?: Role };

export default async function HomePage() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return <SignedOutHome />;
  }

  const metadata = (sessionClaims?.publicMetadata ?? {}) as SessionPublicMetadata;
  const role = metadata.role ?? null;
  const isAdmin = role === 'super_admin';

  const today = todayInAppTZ();
  const { start, end } = dayRangeInAppTZ(today);

  const [salesTotals, withdrawalsTotals, expensesData] = await Promise.all([
    getDailySalesTotals(start, end),
    getDailyWithdrawalsTotals(start, end),
    isAdmin ? listExpenses({ from: today, to: today }) : Promise.resolve(null),
  ]);

  const ventas = new Decimal(salesTotals.salesTotal);
  const retiros = new Decimal(withdrawalsTotals.withdrawalsTotal);
  const gastos = expensesData ? new Decimal(expensesData.total) : new Decimal(0);
  const cajaNeta = ventas.minus(retiros).minus(gastos);
  const cajaCajero = ventas.minus(retiros);

  const todayLabel = formatInTimeZone(
    new Date(),
    APP_TZ,
    "EEEE, d 'de' MMMM",
    { locale: es },
  );

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-8 py-5">
          <div className="flex items-center gap-4">
            <Image
              src="/logo-nombre.png"
              alt="Carestino"
              width={160}
              height={40}
              priority
              className="h-9 w-auto"
            />
            <span className="hidden h-5 w-px bg-border md:block" />
            <span className="hidden text-sm font-medium text-muted-foreground md:inline">
              Santa Fe
            </span>
          </div>
          <div className="flex items-center gap-3">
            <RoleChip role={role} />
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] space-y-12 px-8 py-12">
        <section>
          <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span className="capitalize">{todayLabel}</span>
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
            Resumen del día
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Caja, ventas y retiros de hoy en tiempo real.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Ventas hoy"
            value={formatARS(salesTotals.salesTotal)}
            sublabel={`${salesTotals.salesCount} ${salesTotals.salesCount === 1 ? 'venta' : 'ventas'}`}
            icon={<Receipt className="h-5 w-5" />}
          />
          <KPI
            label="Retiros hoy"
            value={formatARS(withdrawalsTotals.withdrawalsTotal)}
            sublabel={`${withdrawalsTotals.withdrawalsCount} ${withdrawalsTotals.withdrawalsCount === 1 ? 'retiro' : 'retiros'}`}
            icon={<Wallet className="h-5 w-5" />}
          />
          {isAdmin && expensesData && (
            <KPI
              label="Gastos hoy"
              value={formatARS(expensesData.total)}
              sublabel={`${expensesData.count} ${expensesData.count === 1 ? 'gasto' : 'gastos'}`}
              icon={<ShoppingBag className="h-5 w-5" />}
            />
          )}
          {isAdmin ? (
            <KPI
              label="Caja del día"
              value={formatARS(cajaNeta.toFixed(2))}
              sublabel={
                cajaNeta.gte(0)
                  ? 'Ventas − retiros − gastos'
                  : 'Neto negativo · revisar movimientos'
              }
              icon={<Banknote className="h-5 w-5" />}
              tone={cajaNeta.gte(0) ? 'success' : 'destructive'}
              highlight
            />
          ) : (
            <KPI
              label="Caja del día"
              value={formatARS(cajaCajero.toFixed(2))}
              sublabel="Ventas − retiros"
              icon={<TrendingUp className="h-5 w-5" />}
              tone={cajaCajero.gte(0) ? 'success' : 'destructive'}
              highlight
            />
          )}
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Acciones rápidas
          </h2>
          <div
            className={`grid gap-4 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
          >
            <QuickAction
              href="/ventas/nueva"
              label="Nueva venta"
              hint="Registrar una venta del mostrador"
              variant="primary"
            />
            <QuickAction
              href="/retiros/nuevo"
              label="Nuevo retiro"
              hint="Sacar plata de la caja"
            />
            {isAdmin && (
              <QuickAction
                href="/gastos/nuevo"
                label="Nuevo gasto"
                hint="Pagar un proveedor o servicio"
              />
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Operación
          </h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <NavCard
              icon={<Receipt className="h-5 w-5" />}
              title="Ventas"
              description={
                isAdmin
                  ? 'Planilla diaria, mensual y anual con drill-down.'
                  : 'Planilla del día con todos los movimientos.'
              }
              links={
                isAdmin
                  ? [
                      { href: '/ventas/diaria', label: 'Diaria' },
                      { href: '/ventas/mensual', label: 'Mensual' },
                      { href: '/ventas/anual', label: 'Anual' },
                    ]
                  : [{ href: '/ventas/diaria', label: 'Diaria' }]
              }
            />
            <NavCard
              icon={<Wallet className="h-5 w-5" />}
              title="Retiros"
              description={
                isAdmin
                  ? 'Movimientos por día, mes y año.'
                  : 'Sólo carga de retiros nuevos.'
              }
              links={
                isAdmin
                  ? [
                      { href: '/retiros/diaria', label: 'Diaria' },
                      { href: '/retiros/mensual', label: 'Mensual' },
                      { href: '/retiros/anual', label: 'Anual' },
                    ]
                  : []
              }
              empty={!isAdmin ? 'Usá "Nuevo retiro" arriba.' : undefined}
            />
            {isAdmin && (
              <NavCard
                icon={<ShoppingBag className="h-5 w-5" />}
                title="Gastos"
                description="Listado filtrable de proveedores y pagos."
                links={[{ href: '/gastos/lista', label: 'Listado' }]}
              />
            )}
          </div>
        </section>

        {isAdmin && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Configuración
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <ConfigLink
                href="/configuracion/marcas-de-tarjeta"
                icon={<CreditCard className="h-4 w-4" />}
                label="Marcas de tarjeta"
              />
              <ConfigLink
                href="/configuracion/personas-que-retiran"
                icon={<Users className="h-4 w-4" />}
                label="Personas que retiran"
              />
              <ConfigLink
                href="/configuracion/empleados"
                icon={<UserCog className="h-4 w-4" />}
                label="Empleados"
              />
            </div>
          </section>
        )}

        {!role && (
          <section className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Tu sesión no tiene rol asignado. Pediles a un super_admin que setee
            <code className="mx-1 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs">
              publicMetadata.role
            </code>
            en tu usuario de Clerk.
          </section>
        )}
      </div>
    </main>
  );
}

function RoleChip({ role }: { role: Role | null }) {
  const label =
    role === 'super_admin'
      ? 'Super admin'
      : role === 'cajero'
        ? 'Cajero'
        : 'Sin rol';
  const tone = role
    ? 'border-border bg-muted text-muted-foreground'
    : 'border-destructive/30 bg-destructive/10 text-destructive';
  return (
    <span
      className={`hidden items-center rounded-full border px-3 py-1 text-xs font-medium sm:inline-flex ${tone}`}
    >
      {label}
    </span>
  );
}

type KpiTone = 'default' | 'success' | 'destructive';

function KPI({
  label,
  value,
  sublabel,
  icon,
  tone = 'default',
  highlight = false,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: ReactNode;
  tone?: KpiTone;
  highlight?: boolean;
}) {
  const valueClasses =
    tone === 'success'
      ? 'text-success'
      : tone === 'destructive'
        ? 'text-destructive'
        : 'text-foreground';
  return (
    <div
      className={`rounded-card border border-border bg-card p-7 ${
        highlight ? 'shadow-sm ring-1 ring-primary/10' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div
        className={`mt-4 text-4xl font-semibold tabular-nums tracking-tight ${valueClasses}`}
      >
        {value}
      </div>
      {sublabel && (
        <div className="mt-2 text-sm text-muted-foreground">{sublabel}</div>
      )}
    </div>
  );
}

function QuickAction({
  href,
  label,
  hint,
  variant = 'default',
}: {
  href: string;
  label: string;
  hint: string;
  variant?: 'default' | 'primary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between rounded-card border px-6 py-5 transition ${
        isPrimary
          ? 'border-primary/30 bg-primary text-primary-foreground hover:opacity-95'
          : 'border-border bg-card hover:border-primary/30 hover:bg-muted/40'
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-input ${
            isPrimary ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary'
          }`}
        >
          <Plus className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <div className="text-base font-semibold">{label}</div>
          <div
            className={`mt-0.5 text-sm ${
              isPrimary ? 'text-primary-foreground/80' : 'text-muted-foreground'
            }`}
          >
            {hint}
          </div>
        </div>
      </div>
      <ArrowRight
        className={`h-5 w-5 transition group-hover:translate-x-0.5 ${
          isPrimary ? 'text-primary-foreground' : 'text-muted-foreground'
        }`}
      />
    </Link>
  );
}

function NavCard({
  icon,
  title,
  description,
  links,
  empty,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  links: { href: string; label: string }[];
  empty?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-card p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-input bg-muted text-foreground">
          {icon}
        </span>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {links.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center rounded-input border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : empty ? (
        <p className="mt-5 text-xs uppercase tracking-wide text-muted-foreground">
          {empty}
        </p>
      ) : null}
    </div>
  );
}

function ConfigLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-card border border-border bg-card px-5 py-4 transition hover:border-primary/30 hover:bg-muted/40"
    >
      <span className="text-muted-foreground transition group-hover:text-foreground">
        {icon}
      </span>
      <span className="text-base font-medium">{label}</span>
      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function SignedOutHome() {
  return (
    <main className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <Image
            src="/logo-nombre.png"
            alt="Carestino"
            width={400}
            height={100}
            priority
            className="h-16 w-auto"
          />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
            Santa Fe — Sistema interno
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Iniciá sesión para gestionar ventas, retiros y gastos.
          </p>
          <SignInButton mode="modal">
            <button className="mt-8 inline-flex items-center rounded-input bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              Iniciar sesión
            </button>
          </SignInButton>
        </div>
      </div>
    </main>
  );
}
