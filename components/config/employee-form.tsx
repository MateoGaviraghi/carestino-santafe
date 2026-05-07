'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { addEmployee, type EmployeeActionError } from '@/app/actions/employees';
import type { Role } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const ERROR_LABELS: Record<EmployeeActionError, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos.',
  validation_error: 'Datos inválidos.',
  self_edit_blocked: 'No podés modificarte a vos mismo.',
  already_exists: 'Ya existe un usuario con ese email.',
  not_found: 'No encontrado.',
  clerk_error: 'Error de Clerk.',
  internal_error: 'Error interno.',
};

export function EmployeeForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      email: String(fd.get('email') ?? ''),
      firstName: String(fd.get('firstName') ?? '') || undefined,
      lastName: String(fd.get('lastName') ?? '') || undefined,
      password: String(fd.get('password') ?? ''),
      role: (String(fd.get('role') ?? 'cajero') as Role) || 'cajero',
    };
    startTransition(async () => {
      const result = await addEmployee(input);
      if (result.ok) {
        setSuccess(`Empleado agregado (${result.data.userId.slice(0, 8)}…).`);
        formRef.current?.reset();
        router.refresh();
      } else {
        const base = ERROR_LABELS[result.error] ?? 'Error.';
        setError(result.message ? `${base} — ${result.message}` : base);
      }
    });
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="emp-email">Email</Label>
          <Input
            id="emp-email"
            name="email"
            type="email"
            placeholder="empleado@dominio.com"
            required
            autoComplete="off"
            disabled={isPending}
          />
        </div>
        <div>
          <Label htmlFor="emp-role">Rol</Label>
          <Select id="emp-role" name="role" defaultValue="cajero" disabled={isPending}>
            <option value="cajero">Cajero</option>
            <option value="super_admin">Super admin</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="emp-first">Nombre (opcional)</Label>
          <Input id="emp-first" name="firstName" autoComplete="off" disabled={isPending} />
        </div>
        <div>
          <Label htmlFor="emp-last">Apellido (opcional)</Label>
          <Input id="emp-last" name="lastName" autoComplete="off" disabled={isPending} />
        </div>
      </div>

      <div>
        <Label htmlFor="emp-password">Contraseña inicial</Label>
        <Input
          id="emp-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          disabled={isPending}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Mínimo 8 caracteres. El empleado puede cambiarla luego desde su perfil.
        </p>
      </div>

      {error && (
        <p className="rounded-input border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-input border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
          {success}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Plus className="mr-1 h-4 w-4" />
          {isPending ? 'Creando…' : 'Agregar empleado'}
        </Button>
      </div>
    </form>
  );
}
