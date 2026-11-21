import type {
  CommitImportRequest,
  CreateAccountRequest,
  UpdateAccountRequest,
} from '@funance/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  commitImport,
  createAccount,
  getImport,
  getHealth,
  listAccounts,
  listCategories,
  listCsvPresets,
  listImports,
  listOwners,
  previewImport,
  previewLegacyImport,
  renameOwner,
  undoImport,
  updateAccount,
} from './client';

// TanStack Query hooks over the typed client. Query keys: one list per resource.

export const queryKeys = {
  health: ['health'],
  owners: ['owners'],
  accounts: ['accounts'],
  csvPresets: ['csv-presets'],
  categories: ['categories'],
  imports: ['imports'],
  importDetail: (id: number) => ['imports', id] as const,
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

export function useCategories(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.categories, queryFn: listCategories, ...options });
}

export function useImports() {
  return useQuery({ queryKey: queryKeys.imports, queryFn: listImports });
}

export function useImport(id: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.importDetail(id),
    queryFn: () => getImport(id),
    ...options,
  });
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: ({ accountId, file }: { accountId: number; file: File }) =>
      previewImport(accountId, file, file.name),
  });
}

export function usePreviewLegacyImport() {
  return useMutation({ mutationFn: (file: File) => previewLegacyImport(file, file.name) });
}

/** Commit and undo change transactions, so every cached query (lists, reports, counts) refetches. */
export function useCommitImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body?: CommitImportRequest }) =>
      commitImport(id, body),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useUndoImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => undoImport(id),
    onSuccess: () => client.invalidateQueries(),
  });
}
