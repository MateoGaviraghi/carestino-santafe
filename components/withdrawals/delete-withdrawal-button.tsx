'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteWithdrawalDialog } from './delete-withdrawal-dialog';

type Props = {
  withdrawalId: string;
  amount: string;
  withdrawalDate: Date;
  personName: string;
};

export function DeleteWithdrawalButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Eliminar retiro"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {open && <DeleteWithdrawalDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
