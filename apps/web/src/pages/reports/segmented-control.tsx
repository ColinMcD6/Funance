import { cn } from '@/lib/utils';

export type SegmentOption<T> = { value: T; label: string };

/** A row of toggle buttons where exactly one is pressed (owner, grouping, span). */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  /** Accessible name of the group. */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="bg-muted inline-flex max-w-full flex-wrap gap-1 rounded-lg p-1"
    >
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors',
              pressed
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
