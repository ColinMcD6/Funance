import { useMutation } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { clearSession, setSession } from '@/api/client';
import { useOwners } from '@/api/queries';
import { readProfileCookie } from '@/api/session';
import { ProfilePickerPage } from '@/pages/profile-picker/profile-picker-page';
import { ProfileContext, type ProfileContextValue } from './profile-context';

/**
 * Shows the profile picker until the `profile` cookie names a person, then renders `children`
 * with the profile available through `useProfile`.
 */
export function ProfileGate({ children }: { children: ReactNode }) {
  const owners = useOwners();
  const [profileId, setProfileId] = useState(() => readProfileCookie());

  const choose = useMutation({
    mutationFn: setSession,
    onSuccess: (res) => {
      setProfileId(res.owner?.id ?? null);
    },
  });
  const signOut = useMutation({
    mutationFn: clearSession,
    onSuccess: () => {
      setProfileId(null);
    },
  });

  const profile = owners.data?.find((o) => o.id === profileId && o.kind === 'person');

  const value = useMemo<ProfileContextValue | null>(
    () =>
      profile === undefined
        ? null
        : {
            profile,
            switchTo: async (ownerId) => {
              await choose.mutateAsync(ownerId);
            },
            signOut: async () => {
              await signOut.mutateAsync();
            },
          },
    [profile, choose, signOut],
  );

  if (value === null) {
    return (
      <ProfilePickerPage
        owners={owners.data}
        loadError={owners.error?.message}
        choosing={choose.isPending}
        chooseError={choose.error?.message}
        onChoose={(id) => {
          choose.mutate(id);
        }}
      />
    );
  }
  return <ProfileContext value={value}>{children}</ProfileContext>;
}
