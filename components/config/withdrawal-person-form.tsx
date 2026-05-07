'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import {
  addWithdrawalPersonFormAction,
  type ConfigResult,
} from '@/app/actions/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ERROR_LABELS: Record<string, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos.',
  validation_error: 'El nombre no es válido.',
  already_exists: 'Esa persona ya existe.',
  not_found: 'No encontrado.',
  internal_error: 'Error interno. Intentá de nuevo.',
};

export function WithdrawalPersonForm() {
  const [state, formAction, isPending] = useActionState<
    ConfigResult<{ id: number }> | null,
    FormData
  >(addWithdrawalPersonFormAction, null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (state?.ok) {
      if (inputRef.current) inputRef.current.value = '';
      inputRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-2">
      <Label htmlFor="person-name">Nueva persona</Label>
      <div className="flex items-stretch gap-2">
        <Input
          id="person-name"
          name="name"
          ref={inputRef}
          placeholder="Nombre…"
          autoComplete="off"
          disabled={isPending}
          aria-invalid={Boolean(state && !state.ok)}
        />
        <Button type="submit" disabled={isPending}>
          <Plus className="mr-1 h-4 w-4" />
          {isPending ? 'Agregando…' : 'Agregar'}
        </Button>
      </div>
      {state && !state.ok && (
        <p className="text-xs text-destructive">
          {ERROR_LABELS[state.error] ?? 'Error.'}
          {state.message ? ` — ${state.message}` : ''}
        </p>
      )}
      {state?.ok && (
        <p className="text-xs text-success">Persona agregada correctamente.</p>
      )}
    </form>
  );
}
