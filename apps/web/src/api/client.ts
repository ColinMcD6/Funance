import {
  accountListResponseSchema,
  archiveCategoryResponseSchema,
  backupResponseSchema,
  budgetListResponseSchema,
  categoryListResponseSchema,
  changedCountResponseSchema,
  commitImportResponseSchema,
  compareReportResponseSchema,
  createAccountResponseSchema,
  createCategoryResponseSchema,
  createRuleResponseSchema,
  csvPresetListResponseSchema,
  deleteRuleResponseSchema,
  healthResponseSchema,
  importDetailResponseSchema,
  importListResponseSchema,
  importPreviewResponseSchema,
  legacyPreviewResponseSchema,
  monthlyReportResponseSchema,
  ownerListResponseSchema,
  putBudgetsResponseSchema,
  ruleListResponseSchema,
  sessionResponseSchema,
  testRuleResponseSchema,
  transactionListResponseSchema,
  undoImportResponseSchema,
  updateAccountResponseSchema,
  updateCategoryResponseSchema,
  updateOwnerResponseSchema,
  updateRuleResponseSchema,
  updateTransactionResponseSchema,
  type Account,
  type BackupResponse,
  type Budget,
  type BudgetListResponse,
  type Category,
  type CategoryListResponse,
  type ChangedCountResponse,
  type CommitImportRequest,
  type CompareReportQuery,
  type CompareReportResponse,
  type CreateAccountRequest,
  type CreateCategoryRequest,
  type CsvPresetListResponse,
  type DeleteRuleResponse,
  type HealthResponse,
  type ImportDetailResponse,
  type ImportListResponse,
  type ImportPreviewResponse,
  type ImportSummary,
  type LegacyPreviewResponse,
  type MonthlyReportQuery,
  type MonthlyReportResponse,
  type Owner,
  type OwnerListResponse,
  type PutBudgetsRequest,
  type Rule,
  type RuleInput,
  type RuleListResponse,
  type SessionResponse,
  type TestRuleResponse,
  type Transaction,
  type TransactionListResponse,
  type TransactionPatch,
  type TransactionQuery,
  type UpdateAccountRequest,
  type UpdateCategoryRequest,
  type UpdateRuleRequest,
} from '@funance/shared';
import { request } from './http';

// Typed client for every route in PLAN.md section 2, "API". Each function's request and response
// types come from packages/shared; responses are validated against the same schemas in development.

export { ApiRequestError } from './http';

function fileForm(file: Blob, filename: string, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('file', file, filename);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

// ---- Health ----

export function getHealth(): Promise<HealthResponse> {
  return request('/health', healthResponseSchema);
}

// ---- Owners and session ----

export function listOwners(): Promise<OwnerListResponse> {
  return request('/owners', ownerListResponseSchema);
}

export function renameOwner(id: number, name: string): Promise<Owner> {
  return request(`/owners/${id}`, updateOwnerResponseSchema, { method: 'PATCH', body: { name } });
}

export function setSession(ownerId: number): Promise<SessionResponse> {
  return request('/session', sessionResponseSchema, { method: 'POST', body: { ownerId } });
}

export function clearSession(): Promise<SessionResponse> {
  return request('/session', sessionResponseSchema, { method: 'DELETE' });
}

// ---- Accounts and presets ----

export function listAccounts(): Promise<Account[]> {
  return request('/accounts', accountListResponseSchema);
}

export function createAccount(body: CreateAccountRequest): Promise<Account> {
  return request('/accounts', createAccountResponseSchema, { method: 'POST', body });
}

export function updateAccount(id: number, body: UpdateAccountRequest): Promise<Account> {
  return request(`/accounts/${id}`, updateAccountResponseSchema, { method: 'PATCH', body });
}

export function listCsvPresets(): Promise<CsvPresetListResponse> {
  return request('/csv-presets', csvPresetListResponseSchema);
}

// ---- Imports ----

export function previewImport(
  accountId: number,
  file: Blob,
  filename: string,
): Promise<ImportPreviewResponse> {
  return request('/imports/preview', importPreviewResponseSchema, {
    method: 'POST',
    form: fileForm(file, filename, { accountId: String(accountId) }),
  });
}

export function previewLegacyImport(file: Blob, filename: string): Promise<LegacyPreviewResponse> {
  return request('/imports/legacy/preview', legacyPreviewResponseSchema, {
    method: 'POST',
    form: fileForm(file, filename),
  });
}

export function commitImport(id: number, body: CommitImportRequest = {}): Promise<ImportSummary> {
  return request(`/imports/${id}/commit`, commitImportResponseSchema, { method: 'POST', body });
}

export function undoImport(id: number): Promise<ImportSummary> {
  return request(`/imports/${id}/undo`, undoImportResponseSchema, { method: 'POST' });
}

export function listImports(): Promise<ImportListResponse> {
  return request('/imports', importListResponseSchema);
}

export function getImport(id: number): Promise<ImportDetailResponse> {
  return request(`/imports/${id}`, importDetailResponseSchema);
}

// ---- Transactions ----

export function listTransactions(
  params: Partial<TransactionQuery> = {},
): Promise<TransactionListResponse> {
  return request('/transactions', transactionListResponseSchema, { query: params });
}

export function updateTransaction(id: number, patch: TransactionPatch): Promise<Transaction> {
  return request(`/transactions/${id}`, updateTransactionResponseSchema, {
    method: 'PATCH',
    body: patch,
  });
}

export function bulkUpdateTransactions(
  ids: number[],
  patch: TransactionPatch,
): Promise<ChangedCountResponse> {
  return request('/transactions/bulk', changedCountResponseSchema, {
    method: 'POST',
    body: { ids, patch },
  });
}

// ---- Categories ----

export function listCategories(): Promise<CategoryListResponse> {
  return request('/categories', categoryListResponseSchema);
}

export function createCategory(body: CreateCategoryRequest): Promise<Category> {
  return request('/categories', createCategoryResponseSchema, { method: 'POST', body });
}

export function updateCategory(id: number, body: UpdateCategoryRequest): Promise<Category> {
  return request(`/categories/${id}`, updateCategoryResponseSchema, { method: 'PATCH', body });
}

/** Archives the category, first moving its transactions to `reassignTo` when given. */
export function archiveCategory(id: number, reassignTo?: number): Promise<Category> {
  return request(`/categories/${id}`, archiveCategoryResponseSchema, {
    method: 'DELETE',
    query: { reassignTo },
  });
}

// ---- Rules ----

export function listRules(): Promise<RuleListResponse> {
  return request('/rules', ruleListResponseSchema);
}

export function createRule(body: RuleInput): Promise<Rule> {
  return request('/rules', createRuleResponseSchema, { method: 'POST', body });
}

export function updateRule(id: number, body: UpdateRuleRequest): Promise<Rule> {
  return request(`/rules/${id}`, updateRuleResponseSchema, { method: 'PATCH', body });
}

export function deleteRule(id: number): Promise<DeleteRuleResponse> {
  return request(`/rules/${id}`, deleteRuleResponseSchema, { method: 'DELETE' });
}

export function testRule(body: RuleInput): Promise<TestRuleResponse> {
  return request('/rules/test', testRuleResponseSchema, { method: 'POST', body });
}

export function applyRules(): Promise<ChangedCountResponse> {
  return request('/rules/apply', changedCountResponseSchema, { method: 'POST' });
}

// ---- Reports ----

export function getMonthlyReport(
  params: Pick<MonthlyReportQuery, 'from' | 'to'> & Partial<MonthlyReportQuery>,
): Promise<MonthlyReportResponse> {
  return request('/reports/monthly', monthlyReportResponseSchema, { query: params });
}

export function getCompareReport(
  params: Pick<CompareReportQuery, 'month'> & Partial<CompareReportQuery>,
): Promise<CompareReportResponse> {
  return request('/reports/compare', compareReportResponseSchema, { query: params });
}

// ---- Budgets (M9) ----

export function listBudgets(): Promise<BudgetListResponse> {
  return request('/budgets', budgetListResponseSchema);
}

export function putBudgets(budgets: PutBudgetsRequest['budgets']): Promise<Budget[]> {
  return request('/budgets', putBudgetsResponseSchema, { method: 'PUT', body: { budgets } });
}

// ---- Backups ----

export function createBackup(): Promise<BackupResponse> {
  return request('/backup', backupResponseSchema, { method: 'POST' });
}

/** URL of the newest backup file, for a plain download link. */
export const LATEST_BACKUP_URL = '/api/backup/latest';
