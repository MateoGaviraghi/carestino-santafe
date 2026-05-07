'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Props = {
  /** Current selected date in YYYY-MM-DD. */
  date: string;
};

/**
 * Date picker that navigates on change — no submit button. Replaces the
 * form-based picker so the user just changes the calendar value and the
 * page refetches for that day automatically. Other search params (filters,
 * etc.) are preserved.
 */
export function DatePicker({ date }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (!next) return; // browser may briefly emit empty during keyboard editing
    const sp = new URLSearchParams(searchParams);
    sp.set('date', next);
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  return (
    <input
      type="date"
      defaultValue={date}
      onChange={onChange}
      aria-label="Fecha"
      className="h-9 rounded-input border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
