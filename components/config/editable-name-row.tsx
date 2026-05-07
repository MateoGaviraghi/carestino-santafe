'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowUp, Check, EyeOff, Pencil, X } from 'lucide-react';

import {
  renameCardBrand,
  renameWithdrawalPerson,
  setCardBrandActive,
  setWithdrawalPersonActive,
  type ConfigResult,
} from '@/app/actions/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ERROR_LABELS: Record<string, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos.',
  validation_error: 'El nombre no es válido.',
  already_exists: 'Ese nombre ya existe.',
  not_found: 'No encontrado.',
  internal_error: 'Error interno. Intentá de nuevo.',
};

type Variant = 'card-brand' | 'withdrawal-person';

type Props = {
  id: number;
  name: string;
  isActive: boolean;
  variant: Variant;
};

const RENAMERS: Record<
  Variant,
  (id: number, name: string) => Promise<ConfigResult<void>>
> = {
  'card-brand': renameCardBrand,
  'withdrawal-person': renameWithdrawalPerson,
};

const TOGGLERS: Record<
  Variant,
  (id: number, isActive: boolean) => Promise<ConfigResult<void>>
> = {
  'card-brand': setCardBrandActive,
  'withdrawal-person': setWithdrawalPersonActive,
};

export function EditableNameRow({ id, name, isActive, variant }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // If the prop name changes (after revalidate) reset the draft.
  useEffect(() => {
    setDraft(name);
  }, [name]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await RENAMERS[variant](id, trimmed);
      if (result.ok) {
        setEditing(false);
      } else {
        setError(
          ERROR_LABELS[result.error] ?? 'Error.' +
            (result.message ? ` — ${result.message}` : ''),
        );
      }
    });
  };

  const handleCancel = () => {
    setDraft(name);
    setError(null);
    setEditing(false);
  };

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await TOGGLERS[variant](id, !isActive);
      if (!result.ok) {
        setError(ERROR_LABELS[result.error] ?? 'Error.');
      }
    });
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-3 font-medium">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancel();
                }
              }}
              disabled={isPending}
              className="h-8"
            />
          </div>
        ) : (
          name
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
            isActive
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-border bg-muted text-muted-foreground',
          )}
        >
          {isActive ? 'Activa' : 'Inactiva'}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
              >
                <X className="mr-1 h-3 w-3" />
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isPending || draft.trim().length === 0}
              >
                <Check className="mr-1 h-3 w-3" />
                {isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={isPending}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Editar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggle}
                disabled={isPending}
              >
                {isActive ? (
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
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
