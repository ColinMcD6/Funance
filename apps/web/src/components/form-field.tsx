import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';

type Props = {
  label: string;
  hint?: string;
  /** Renders the control, given the id that links it to the label. */
  children: (id: string) => ReactNode;
};

/** A label above a form control, with an optional hint below. */
export function FormField({ label, hint, children }: Props) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint !== undefined && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
