import type { Owner } from '@funance/shared';
import { createContext, useContext } from 'react';

export type ProfileContextValue = {
  /** The active profile: one of the `person` owners. */
  profile: Owner;
  /** Makes another person the active profile (POST /session). */
  switchTo: (ownerId: number) => Promise<void>;
  /** Clears the profile and returns to the picker (DELETE /session). */
  signOut: () => Promise<void>;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

/** The active profile. Only valid inside `ProfileGate`, which renders children only with one. */
export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (value === null) throw new Error('useProfile must be used inside ProfileGate');
  return value;
}
