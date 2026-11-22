import type {
  CommitImportRequest,
  CompareReportQuery,
  MonthlyReportQuery,
  CreateAccountRequest,
  CreateCategoryRequest,
  RuleInput,
  TransactionListResponse,
  TransactionPatch,
  TransactionQuery,
  UpdateAccountRequest,
  UpdateCategoryRequest,
  UpdateRuleRequest,
} from '@funance/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  applyRules,
  archiveCategory,
  bulkUpdateTransactions,
  commitImport,
  createAccount,
  createCategory,
  createRule,
  deleteRule,
  getCompareReport,
  getMonthlyReport,
  getImport,
  getHealth,
  listAccounts,
  listCategories,
  listCsvPresets,
  listImports,
  listOwners,
  listRules,
  listTransactions,
  previewImport,
  previewLegacyImport,
  renameOwner,
  testRule,
  undoImport,
  updateAccount,
  updateCategory,
  updateRule,
  updateTransaction,
} from './client';

// TanStack Query hooks over the typed client. Query keys: one list per resource.

export const queryKeys = {
  health: ['health'],
  owners: ['owners'],
  accounts: ['accounts'],
  csvPresets: ['csv-presets'],
  categories: ['categories'],
  rules: ['rules'],
  ruleTest: (draft: RuleInput | null) => ['rules', 'test', draft] as const,
  imports: ['imports'],
  importDetail: (id: number) => ['imports', id] as const,
  transactions: ['transactions'],
  transactionList: (query: TransactionQuery) => ['transactions', query] as const,
  monthlyReport: (query: MonthlyReportQuery) => ['reports', 'monthly', query] as const,
  compareReport: (query: CompareReportQuery) => ['reports', 'compare', query] as const,
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

/** One page of transactions; the previous page stays on screen while the next one loads. */
export function useTransactions(query: TransactionQuery) {
  return useQuery({
    queryKey: queryKeys.transactionList(query),
    queryFn: () => listTransactions(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Shows an edit in every cached transaction list at once, so an inline select does not snap back
 * while the request runs. Returns the previous lists, to put back if the request fails.
 */
function applyOptimisticPatch(
  client: QueryClient,
  ids: readonly number[],
  patch: TransactionPatch,
) {
  const idSet = new Set(ids);
  // categorySource is recorded by the server; the visible fields are the rest.
  const fields = {
    ...(patch.ownerId !== undefined && { ownerId: patch.ownerId }),
    ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.excluded !== undefined && { excluded: patch.excluded }),
  };
  const previous = client.getQueriesData<TransactionListResponse>({
    queryKey: queryKeys.transactions,
  });
  client.setQueriesData<TransactionListResponse>({ queryKey: queryKeys.transactions }, (old) =>
    old === undefined
      ? old
      : {
          ...old,
          items: old.items.map((t) => (idSet.has(t.id) ? { ...t, ...fields } : t)),
        },
  );
  return previous;
}

function transactionEditOptions<V>(
  client: QueryClient,
  target: (vars: V) => {
    ids: readonly number[];
    patch: TransactionPatch;
  },
) {
  return {
    onMutate: async (vars: V) => {
      await client.cancelQueries({ queryKey: queryKeys.transactions });
      const { ids, patch } = target(vars);
      return applyOptimisticPatch(client, ids, patch);
    },
    onError: (
      _error: Error,
      _vars: V,
      previous: ReturnType<typeof applyOptimisticPatch> | undefined,
    ) => {
      for (const [key, data] of previous ?? []) client.setQueryData(key, data);
    },
    // Edits change lists, counts and (later) reports, so every cached query refetches.
    onSettled: () => client.invalidateQueries(),
  };
}

export function useUpdateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TransactionPatch }) =>
      updateTransaction(id, patch),
    ...transactionEditOptions(client, ({ id, patch }: { id: number; patch: TransactionPatch }) => ({
      ids: [id],
      patch,
    })),
  });
}

export function useBulkUpdateTransactions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, patch }: { ids: number[]; patch: TransactionPatch }) =>
      bulkUpdateTransactions(ids, patch),
    ...transactionEditOptions(client, (vars: { ids: number[]; patch: TransactionPatch }) => vars),
  });
}

// ---- Categories and rules (M6) ----
// Archiving moves transactions and rules, and a rule apply recategorizes rows, so these
// mutations refetch every cached query rather than guess which ones changed.

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => createCategory(body),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateCategoryRequest }) =>
      updateCategory(id, patch),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useArchiveCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reassignTo }: { id: number; reassignTo?: number }) =>
      archiveCategory(id, reassignTo),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useRules() {
  return useQuery({ queryKey: queryKeys.rules, queryFn: listRules });
}

/** The live match count and samples of an unsaved rule; off while `draft` is null. */
export function useRuleTest(draft: RuleInput | null) {
  return useQuery({
    queryKey: queryKeys.ruleTest(draft),
    queryFn: () =>
      draft === null ? Promise.reject(new Error('No rule to test')) : testRule(draft),
    enabled: draft !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useCreateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RuleInput) => createRule(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.rules }),
  });
}

export function useUpdateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateRuleRequest }) => updateRule(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.rules }),
  });
}

export function useDeleteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRule(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.rules }),
  });
}

export function useApplyRules() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => applyRules(),
    onSuccess: () => client.invalidateQueries(),
  });
}

/** GET /reports/monthly; the previous report stays on screen while the next one loads. */
export function useMonthlyReport(query: MonthlyReportQuery) {
  return useQuery({
    queryKey: queryKeys.monthlyReport(query),
    queryFn: () => getMonthlyReport(query),
    placeholderData: keepPreviousData,
  });
}

/** GET /reports/compare */
export function useCompareReport(query: CompareReportQuery) {
  return useQuery({
    queryKey: queryKeys.compareReport(query),
    queryFn: () => getCompareReport(query),
    placeholderData: keepPreviousData,
  });
}
