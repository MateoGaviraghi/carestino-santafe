'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteExpenseDialog } from './delete-expense-dialog';

type Props = {
  expenseId: string;
  amount: string;
  expenseDate: Date;
  provider: string;
};

export function DeleteExpenseButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Eliminar gasto"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {open && <DeleteExpenseDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
