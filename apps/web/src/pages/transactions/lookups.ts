import type { Account, Category, Owner, TransactionPatch } from '@funance/shared';

/** Names and choices the list rows need, loaded once by the page. */
export type Lookups = {
  owners: readonly Owner[];
  accounts: readonly Account[];
  categories: readonly Category[];
};

export function ownerName(lookups: Lookups, id: number): string {
  return lookups.owners.find((o) => o.id === id)?.name ?? `Owner ${id}`;
}

export function accountName(lookups: Lookups, id: number | null): string {
  if (id === null) return 'None';
  return lookups.accounts.find((a) => a.id === id)?.name ?? `Account ${id}`;
}

/** Called by a row's inline owner or category select. */
export type EditTransaction = (id: number, patch: TransactionPatch) => void;
