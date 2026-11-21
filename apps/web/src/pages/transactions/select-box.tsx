import { useEffect, useRef } from 'react';

type Props = {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
};

/** A native checkbox for selecting rows, with an optional mixed state for "select all". */
export function SelectBox({ label, checked, indeterminate = false, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      className="accent-primary size-4 align-middle"
      checked={checked}
      onChange={onChange}
    />
  );
}
