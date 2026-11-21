import { useState } from 'react';
import { useOwners } from '@/api/queries';
import { NativeSelect } from '@/components/native-select';
import { useProfile } from './profile-context';

const SIGN_OUT = 'sign-out';

/** Header control showing the active profile; choosing another person switches to them. */
export function ProfileSwitcher() {
  const { profile, switchTo, signOut } = useProfile();
  const owners = useOwners();
  const [error, setError] = useState<string>();
  const people = owners.data?.filter((o) => o.kind === 'person') ?? [profile];

  async function onChange(value: string) {
    setError(undefined);
    try {
      if (value === SIGN_OUT) await signOut();
      else await switchTo(Number(value));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        aria-label="Active profile"
        className="w-auto"
        value={String(profile.id)}
        onChange={(e) => void onChange(e.target.value)}
      >
        {people.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
        <option value={SIGN_OUT}>Choose profile…</option>
      </NativeSelect>
      {error !== undefined && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
