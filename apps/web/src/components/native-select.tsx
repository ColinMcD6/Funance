import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A styled native `<select>`. Native controls keep phone pickers and keyboard use working
 * without extra code, and Playwright drives them with `selectOption`.
 */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
