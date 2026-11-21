import type { CreateAccountRequest, UpdateAccountRequest } from '@funance/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAccount,
  getHealth,
  listAccounts,
  listCsvPresets,
  listOwners,
  renameOwner,
  updateAccount,
} from './client';

// TanStack Query hooks over the typed client. Query keys: one list per resource.

export const queryKeys = {
  health: ['health'],
  owners: ['owners'],
  accounts: ['accounts'],
  csvPresets: ['csv-presets'],
} as const;

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: getHealth, retry: false });
}

export function useOwners() {
  return useQuery({ queryKey: queryKeys.owners, queryFn: listOwners });
}

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: listAccounts });
}

export function useCsvPresets() {
  return useQuery({ queryKey: queryKeys.csvPresets, queryFn: listCsvPresets, staleTime: Infinity });
}

export function useRenameOwner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameOwner(id, name),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.owners }),
  });
}

export function useCreateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAccountRequest) => createAccount(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}

export function useUpdateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateAccountRequest }) =>
      updateAccount(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
