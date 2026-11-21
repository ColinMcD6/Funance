import {
  createAccountRequestSchema,
  type Account,
  type AccountType,
  type CreateAccountRequest,
  type CsvMapping,
  type CsvPreset,
  type Institution,
} from '@funance/shared';

// The account form edits an `AccountDraft`: every field as the text the user typed. These pure
// functions convert between a draft and the API's `CreateAccountRequest`.

/** Optional single-column mappings, each a text field (empty = not mapped). */
export const OPTIONAL_COLUMNS = [
  'postedDate',
  'memo',
  'amount',
  'outflow',
  'inflow',
  'externalId',
  'bankCategory',
  'ownerHint',
  'accountFilter',
] as const;
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export type SkipWhenDraft = { column: string; notEquals: string; matches: string };
export type OwnerHintDraft = { value: string; ownerId: string };

export type AccountDraft = {
  name: string;
  institution: Institution;
  type: AccountType;
  /** Owner id as text; empty until chosen. */
  defaultOwnerId: string;
  encoding: CsvMapping['encoding'];
  hasHeader: boolean;
  dateColumn: string;
  /** One column name per line, joined in order. */
  descriptionColumns: string;
  columns: Record<OptionalColumn, string>;
  dateFormat: CsvMapping['dateFormat'];
  amountSign: CsvMapping['amountSign'];
  bankCategoryRegex: string;
  accountFilterValue: string;
  skipZeroAmount: boolean;
  skipWhen: SkipWhenDraft[];
  ownerHints: OwnerHintDraft[];
};

function emptyColumns(): Record<OptionalColumn, string> {
  return Object.fromEntries(OPTIONAL_COLUMNS.map((c) => [c, ''])) as Record<OptionalColumn, string>;
}

export function emptyDraft(): AccountDraft {
  return {
    name: '',
    institution: 'other',
    type: 'chequing',
    defaultOwnerId: '',
    encoding: 'utf-8',
    hasHeader: true,
    dateColumn: '',
    descriptionColumns: '',
    columns: emptyColumns(),
    dateFormat: 'MM/dd/yyyy',
    amountSign: 'negative_is_outflow',
    bankCategoryRegex: '',
    accountFilterValue: '',
    skipZeroAmount: false,
    skipWhen: [],
    ownerHints: [],
  };
}

/** Replaces the draft's mapping fields with `mapping`, keeping name, kind and owner. */
export function withMapping(draft: AccountDraft, mapping: CsvMapping): AccountDraft {
  const columns = emptyColumns();
  for (const key of OPTIONAL_COLUMNS) columns[key] = mapping.columns[key] ?? '';
  return {
    ...draft,
    encoding: mapping.encoding,
    hasHeader: mapping.hasHeader,
    dateColumn: mapping.columns.date,
    descriptionColumns: mapping.columns.description.join('\n'),
    columns,
    dateFormat: mapping.dateFormat,
    amountSign: mapping.amountSign,
    bankCategoryRegex: mapping.bankCategoryRegex ?? '',
    accountFilterValue: mapping.accountFilterValue ?? '',
    skipZeroAmount: mapping.skipZeroAmount,
    skipWhen: (mapping.skipWhen ?? []).map((s) => ({
      column: s.column,
      notEquals: s.notEquals ?? '',
      matches: s.matches ?? '',
    })),
    ownerHints: Object.entries(mapping.ownerHintMap ?? {}).map(([value, ownerId]) => ({
      value,
      ownerId: String(ownerId),
    })),
  };
}

/** Applies a preset: its institution, type and mapping. Name and default owner are kept. */
export function withPreset(draft: AccountDraft, preset: CsvPreset): AccountDraft {
  return withMapping(
    { ...draft, institution: preset.institution, type: preset.type },
    structuredClone(preset.mapping),
  );
}

export function draftFromAccount(account: Account): AccountDraft {
  return withMapping(
    {
      ...emptyDraft(),
      name: account.name,
      institution: account.institution,
      type: account.type,
      defaultOwnerId: String(account.defaultOwnerId),
    },
    account.csvMapping,
  );
}

export type DraftResult =
  { ok: true; request: CreateAccountRequest } | { ok: false; errors: string[] };

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Plain messages for the schema paths a user can get wrong in the form. */
const PATH_MESSAGES: Record<string, string> = {
  name: 'Enter a name',
  defaultOwnerId: 'Choose a default owner',
  'csvMapping.columns.date': 'Enter the date column',
  'csvMapping.columns.description': 'Enter at least one description column',
};

/**
 * Builds the request from a draft, or lists what is wrong. Empty optional fields are left out
 * of the mapping; an owner-hint column always gets a map (empty when no names are listed).
 */
export function draftToRequest(draft: AccountDraft): DraftResult {
  const errors: string[] = [];

  const columns: CsvMapping['columns'] = {
    date: draft.dateColumn.trim(),
    description: draft.descriptionColumns
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c !== ''),
  };
  for (const key of OPTIONAL_COLUMNS) {
    const value = optional(draft.columns[key]);
    if (value !== undefined) columns[key] = value;
  }

  const ownerHintMap: Record<string, number> = {};
  for (const hint of draft.ownerHints) {
    const value = hint.value.trim();
    if (value === '') {
      errors.push('Every owner hint needs a value');
      continue;
    }
    if (hint.ownerId === '') {
      errors.push(`Choose an owner for "${value}"`);
      continue;
    }
    if (value in ownerHintMap) errors.push(`"${value}" is listed twice in the owner hints`);
    ownerHintMap[value] = Number(hint.ownerId);
  }

  const skipWhen: NonNullable<CsvMapping['skipWhen']> = [];
  for (const rule of draft.skipWhen) {
    const column = rule.column.trim();
    if (column === '') {
      errors.push('Every skip rule needs a column');
      continue;
    }
    const entry: (typeof skipWhen)[number] = { column };
    // Kept exactly as typed: a value may need its spaces.
    if (rule.notEquals !== '') entry.notEquals = rule.notEquals;
    if (rule.matches !== '') entry.matches = rule.matches;
    skipWhen.push(entry);
  }

  if (draft.bankCategoryRegex !== '') {
    try {
      new RegExp(draft.bankCategoryRegex);
    } catch {
      errors.push('Bank category pattern is not a valid regular expression');
    }
  }

  const mapping: CsvMapping = {
    encoding: draft.encoding,
    hasHeader: draft.hasHeader,
    columns,
    dateFormat: draft.dateFormat,
    amountSign: draft.amountSign,
    skipZeroAmount: draft.skipZeroAmount,
  };
  if (draft.bankCategoryRegex !== '') mapping.bankCategoryRegex = draft.bankCategoryRegex;
  if (columns.ownerHint !== undefined || Object.keys(ownerHintMap).length > 0) {
    mapping.ownerHintMap = ownerHintMap;
  }
  if (draft.accountFilterValue !== '') mapping.accountFilterValue = draft.accountFilterValue;
  if (skipWhen.length > 0) mapping.skipWhen = skipWhen;

  const parsed = createAccountRequestSchema.safeParse({
    name: draft.name,
    institution: draft.institution,
    type: draft.type,
    defaultOwnerId: draft.defaultOwnerId === '' ? undefined : Number(draft.defaultOwnerId),
    csvMapping: mapping,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const message =
        PATH_MESSAGES[path] ??
        (path === 'csvMapping.columns' ? issue.message : `${path}: ${issue.message}`);
      if (!errors.includes(message)) errors.push(message);
    }
  }
  if (errors.length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, request: parsed.data };
}
