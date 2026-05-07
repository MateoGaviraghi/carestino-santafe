'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, EyeOff } from 'lucide-react';

import {
  setEmployeeActive,
  setEmployeeRole,
  type EmployeeActionError,
} from '@/app/actions/employees';
import type { Role, User } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ERROR_LABELS: Record<EmployeeActionError, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos.',
  validation_error: 'Datos inválidos.',
  self_edit_blocked: 'No podés modificarte a vos mismo.',
  already_exists: 'Ya existe.',
  not_found: 'No encontrado.',
  clerk_error: 'Error de Clerk.',
  internal_error: 'Error interno.',
};

const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  cajero: 'Cajero',
};

type Props = {
  user: User;
  isSelf: boolean;
};

export function EmployeeRow({ user, isSelf }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onRoleChange = (role: Role) => {
    if (role === user.role) return;
    setError(null);
    startTransition(async () => {
      const result = await setEmployeeRole({ userId: user.id, role });
      if (!result.ok) {
        setError(
          (ERROR_LABELS[result.error] ?? 'Error.') +
            (result.message ? ` — ${result.message}` : ''),
        );
      } else {
        router.refresh();
      }
    });
  };

  const onToggleActive = () => {
    setError(null);
    startTransition(async () => {
      const result = await setEmployeeActive(user.id, !user.isActive);
      if (!result.ok) {
        setError(
          (ERROR_LABELS[result.error] ?? 'Error.') +
            (result.message ? ` — ${result.message}` : ''),
        );
      } else {
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-3 py-3">
        <div className="font-medium">{user.displayName ?? '—'}</div>
        <div className="text-xs text-muted-foreground">{user.email ?? '—'}</div>
        {isSelf && (
          <div className="mt-1 text-[10px] uppercase tracking-wide text-primary">
            (vos)
          </div>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
      <td className="px-3 py-3">
        {isSelf ? (
          <span className="text-sm">{ROLE_LABEL[user.role as Role]}</span>
        ) : (
          <Select
            value={user.role}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            disabled={isPending}
            className="h-8"
          >
            <option value="cajero">Cajero</option>
            <option value="super_admin">Super admin</option>
          </Select>
        )}
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
            user.isActive
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-border bg-muted text-muted-foreground',
          )}
        >
          {user.isActive ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleActive}
          disabled={isPending || isSelf}
          title={isSelf ? 'No podés desactivarte a vos mismo' : undefined}
        >
          {user.isActive ? (
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
      </td>
    </tr>
  );
}
