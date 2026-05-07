'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteSaleDialog } from './delete-sale-dialog';

type Props = {
  saleId: string;
  totalAmount: string;
  saleDate: Date;
};

export function DeleteSaleButton({ saleId, totalAmount, saleDate }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Eliminar venta"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {open && (
        <DeleteSaleDialog
          saleId={saleId}
          totalAmount={totalAmount}
          saleDate={saleDate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
