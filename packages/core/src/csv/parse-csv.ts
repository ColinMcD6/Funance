import type { CsvMapping, RawRow } from '@funance/shared';
import { parse } from 'csv-parse/sync';
import { parseAmountCents } from './amount.js';
import { parseCsvDate } from './date.js';
import { decodeCsvBytes } from './decode.js';
import { dedupKey } from './dedup.js';
import { merchantKey } from './merchant.js';

/** Who imported rows belong to when the mapping's owner hint does not say otherwise. */
export type OwnerDefaults = {
  /** The account's `default_owner_id`. */
  defaultOwnerId: number;
};

type RowBase = {
  /** 1-based line in the file where the row starts (the header is line 1). */
  line: number;
  /** The source row: keyed by trimmed header name, or positional for headerless files. */
  raw: RawRow;
};

/** A data row read into normalized transaction fields. */
export type ParsedOkRow = RowBase & {
  status: 'parsed';
  date: string;
  postedDate: string | null;
  /** Signed: negative = money leaving the household. */
  amountCents: number;
  /** Description columns joined with one space, whitespace collapsed. */
  description: string;
  memo: string | null;
  merchantKey: string;
  bankCategory: string | null;
  externalId: string | null;
  dedupKey: string;
  /** The owner-hint cell as written, when the mapping has an owner-hint column. */
  ownerHint: string | null;
  ownerId: number;
};

/** A row left out on purpose (skip rule, zero amount, other account, blank line). */
export type ParsedSkippedRow = RowBase & { status: 'skipped'; reason: string };

/** A row that could not be read. */
export type ParsedErrorRow = RowBase & { status: 'error'; reason: string };

export type ParsedRow = ParsedOkRow | ParsedSkippedRow | ParsedErrorRow;

type Record_ = { fields: string[]; line: number } | { error: string; line: number };

/** UTF-8 length of one UTF-16 code unit sequence position (surrogate pairs count 2 + 2). */
function utf8Length(code: number): number {
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code >= 0xd800 && code <= 0xdfff) return 2; // half of a 4-byte character
  return 3;
}

/**
 * Where each physical line starts (index 0 is line 1), as a UTF-16 offset into `text` (for
 * slicing) and as a UTF-8 byte offset (csv-parse reports positions in UTF-8 bytes).
 */
function lineStarts(text: string): { chars: number[]; bytes: number[] } {
  const chars = [0];
  const bytes = [0];
  let byte = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    byte += utf8Length(code);
    const isBreak = code === 0x0a || (code === 0x0d && text.charCodeAt(i + 1) !== 0x0a);
    if (isBreak) {
      chars.push(i + 1);
      bytes.push(byte);
    }
  }
  return { chars, bytes };
}

/** The 1-based line holding UTF-8 byte `offset`. */
function lineAtByte(byteStarts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = byteStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((byteStarts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Splits the text into records without throwing. After a malformed record csv-parse cannot
 * resynchronise (a stray quote swallows the rest of the file), so the record that failed is
 * reported as an error on the line where it starts, and parsing restarts on the next line.
 *
 * Line numbers come from csv-parse's byte position (`context.bytes`), not its line count, which
 * counts a CRLF inside a quoted cell as two lines.
 */
function readRecords(text: string): Record_[] {
  const starts = lineStarts(text);
  const events: Record_[] = [];
  let fromLine = 1;
  while (fromLine <= starts.chars.length) {
    const chunk = text.slice(starts.chars[fromLine - 1]);
    const failed = readRecordsFrom(chunk, starts.bytes[fromLine - 1] ?? 0, starts.bytes, events);
    if (failed === null) break;
    // Line numbers in the message are relative to the restarted chunk, so drop them.
    const message = failed.message.replace(/ at line \d+/g, '');
    events.push({ error: `Unreadable CSV: ${message}`, line: failed.line });
    fromLine = failed.line + 1;
  }
  return events;
}

/**
 * Appends the records of `chunk` (which starts at UTF-8 byte `baseByte` of the file) to
 * `events`, up to the first malformed record, and returns the line where that record starts,
 * or null when the chunk was clean.
 */
function readRecordsFrom(
  chunk: string,
  baseByte: number,
  byteStarts: readonly number[],
  events: Record_[],
): { line: number; message: string } | null {
  const state: { lastEndByte: number; failed: { line: number; message: string } | null } = {
    lastEndByte: 0,
    failed: null,
  };
  const startLine = (): number => lineAtByte(byteStarts, baseByte + state.lastEndByte);
  parse(chunk, {
    bom: false,
    relax_column_count: true,
    skip_empty_lines: false,
    skip_records_with_error: true,
    on_record: (record, context) => {
      if (state.failed === null) {
        events.push({ fields: record, line: startLine() });
        state.lastEndByte = context.bytes;
      }
      return null;
    },
    on_skip: (err) => {
      state.failed ??= { line: startLine(), message: err?.message ?? 'unknown error' };
    },
  });
  return state.failed;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function emptyToNull(value: string | undefined): string | null {
  const v = value?.trim() ?? '';
  return v === '' ? null : v;
}

/** Compiles a user-editable pattern, or returns the reason it cannot be used. */
function compile(pattern: string, what: string): RegExp | string {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return `Invalid ${what} pattern: ${pattern}`;
  }
}

/** Column names the mapping reads, with what reads them. */
function mappedColumns(mapping: CsvMapping): string[] {
  const c = mapping.columns;
  const names = [
    c.date,
    c.postedDate,
    ...c.description,
    c.memo,
    c.amount,
    c.outflow,
    c.inflow,
    c.externalId,
    c.bankCategory,
    c.ownerHint,
    c.accountFilter,
    ...(mapping.skipWhen ?? []).map((s) => s.column),
  ];
  return [...new Set(names.filter((n): n is string => n !== undefined))];
}

/**
 * The columns `mapping` reads that the file does not have, in mapping order. For a file with a
 * header these are header names; for a headerless file, 1-based column numbers beyond the first
 * row's width. Empty when every column is present, or when the file has no readable first row
 * (`parseCsv` reports that case on its rows).
 */
export function missingCsvColumns(content: Uint8Array, mapping: CsvMapping): string[] {
  const first = readRecords(decodeCsvBytes(content, mapping.encoding))[0];
  if (first === undefined || 'error' in first) return [];
  const present = new Set(
    mapping.hasHeader
      ? first.fields.map((h) => h.trim())
      : first.fields.map((_, i) => String(i + 1)),
  );
  return mappedColumns(mapping).filter((name) => !present.has(name));
}

/**
 * Reads a bank CSV export into one `ParsedRow` per data row (PLAN.md milestone M2). Never throws
 * on bad input: problems become `error` rows with a reason, and deliberately ignored rows become
 * `skipped` rows. Each row keeps its line number and the raw source row.
 *
 * With `hasHeader` false, column names in the mapping are 1-based column numbers ("1", "2", ...).
 */
export function parseCsv(
  content: Uint8Array,
  mapping: CsvMapping,
  ownerDefaults: OwnerDefaults,
): ParsedRow[] {
  const records = readRecords(decodeCsvBytes(content, mapping.encoding));

  let header: string[] | null = null;
  let body = records;
  if (mapping.hasHeader) {
    const first = records[0];
    if (first === undefined) return [];
    if ('error' in first) {
      return records.map((r) => ({
        line: r.line,
        raw: 'fields' in r ? r.fields : [],
        status: 'error',
        reason: 'error' in r ? r.error : 'The header row could not be read',
      }));
    }
    header = first.fields.map((h) => h.trim());
    body = records.slice(1);
  }

  const index = new Map<string, number>();
  if (header !== null) header.forEach((name, i) => index.has(name) || index.set(name, i));
  const width = header?.length ?? null;
  const columnIndex = (name: string): number | undefined =>
    header !== null ? index.get(name) : /^\d+$/.test(name) ? Number(name) - 1 : undefined;

  // Problems that affect every row: report them on each one rather than throwing.
  const fileProblems: string[] = [];
  const missing = mappedColumns(mapping).filter((n) => columnIndex(n) === undefined);
  if (missing.length > 0) fileProblems.push(`Missing column(s): ${missing.join(', ')}`);
  const bankCategoryRegex =
    mapping.bankCategoryRegex !== undefined
      ? compile(mapping.bankCategoryRegex, 'bank category')
      : null;
  if (typeof bankCategoryRegex === 'string') fileProblems.push(bankCategoryRegex);
  const skipRules = (mapping.skipWhen ?? []).map((rule) => ({
    ...rule,
    regex: rule.matches !== undefined ? compile(rule.matches, 'skip') : null,
  }));
  for (const rule of skipRules) if (typeof rule.regex === 'string') fileProblems.push(rule.regex);
  const ownerHints = new Map(
    Object.entries(mapping.ownerHintMap ?? {}).map(([k, v]) => [k.trim().toUpperCase(), v]),
  );

  return body.map((record): ParsedRow => {
    if ('error' in record) {
      return { line: record.line, raw: [], status: 'error', reason: record.error };
    }
    const { fields, line } = record;
    const raw: RawRow =
      header === null
        ? fields
        : Object.fromEntries(
            header.flatMap((name, i) => (i < fields.length ? [[name, fields[i]]] : [])),
          );
    const fail = (reason: string): ParsedErrorRow => ({ line, raw, status: 'error', reason });
    const skip = (reason: string): ParsedSkippedRow => ({ line, raw, status: 'skipped', reason });

    if (fields.every((f) => f.trim() === '')) return skip('Blank line');
    const firstProblem = fileProblems[0];
    if (firstProblem !== undefined) return fail(firstProblem);
    if (width !== null && fields.length !== width) {
      return fail(`Row has ${fields.length} fields, the header has ${width}`);
    }
    const cell = (name: string): string => fields[columnIndex(name) ?? -1] ?? '';

    for (const rule of skipRules) {
      const value = cell(rule.column).trim();
      const notEqualsHit = rule.notEquals === undefined || value !== rule.notEquals;
      const matchesHit = !(rule.regex instanceof RegExp) || rule.regex.test(value);
      if ((rule.notEquals !== undefined || rule.regex !== null) && notEqualsHit && matchesHit) {
        const why =
          rule.notEquals !== undefined ? `is not "${rule.notEquals}"` : 'matches the skip pattern';
        return skip(`${rule.column} "${value}" ${why}`);
      }
    }

    const { columns } = mapping;
    if (columns.accountFilter !== undefined && mapping.accountFilterValue !== undefined) {
      const account = cell(columns.accountFilter).trim();
      if (account !== mapping.accountFilterValue.trim()) {
        return skip(`Account ${account} is not ${mapping.accountFilterValue.trim()}`);
      }
    }

    const dateText = cell(columns.date);
    const date = parseCsvDate(dateText, mapping.dateFormat);
    if (date === null) return fail(`Date "${dateText.trim()}" is not a ${mapping.dateFormat} date`);

    let postedDate: string | null = null;
    if (columns.postedDate !== undefined && cell(columns.postedDate).trim() !== '') {
      const postedText = cell(columns.postedDate);
      postedDate = parseCsvDate(postedText, mapping.dateFormat);
      if (postedDate === null) {
        return fail(`Posted date "${postedText.trim()}" is not a ${mapping.dateFormat} date`);
      }
    }

    let amountCents: number;
    if (columns.amount !== undefined) {
      const amount = parseAmountCents(cell(columns.amount));
      if (amount.kind === 'invalid') return fail(amount.reason);
      if (amount.kind === 'empty') return fail('Amount is empty');
      const signed = mapping.amountSign === 'positive_is_outflow' ? -amount.cents : amount.cents;
      amountCents = signed === 0 ? 0 : signed;
    } else {
      const outflow = parseAmountCents(cell(columns.outflow ?? ''));
      const inflow = parseAmountCents(cell(columns.inflow ?? ''));
      if (outflow.kind === 'invalid') return fail(`Outflow: ${outflow.reason}`);
      if (inflow.kind === 'invalid') return fail(`Inflow: ${inflow.reason}`);
      if (outflow.kind === 'empty' && inflow.kind === 'empty') {
        return fail('Both outflow and inflow are empty');
      }
      const out = outflow.kind === 'ok' ? Math.abs(outflow.cents) : 0;
      const into = inflow.kind === 'ok' ? Math.abs(inflow.cents) : 0;
      amountCents = into - out;
    }
    if (amountCents === 0 && mapping.skipZeroAmount) return skip('Zero amount');

    const description = collapse(
      columns.description
        .map((name) => cell(name).trim())
        .filter((v) => v !== '')
        .join(' '),
    );
    if (description === '') return fail('Description is empty');

    let bankCategory =
      columns.bankCategory !== undefined ? emptyToNull(cell(columns.bankCategory)) : null;
    if (bankCategory !== null && bankCategoryRegex instanceof RegExp) {
      bankCategory = emptyToNull(bankCategoryRegex.exec(bankCategory)?.[1]);
    }

    const externalId =
      columns.externalId !== undefined
        ? emptyToNull(cell(columns.externalId).replace(/"/g, ''))
        : null;
    const ownerHint = columns.ownerHint !== undefined ? emptyToNull(cell(columns.ownerHint)) : null;
    const ownerId =
      (ownerHint !== null ? ownerHints.get(ownerHint.toUpperCase()) : undefined) ??
      ownerDefaults.defaultOwnerId;

    return {
      line,
      raw,
      status: 'parsed',
      date,
      postedDate,
      amountCents,
      description,
      memo: columns.memo !== undefined ? emptyToNull(cell(columns.memo)) : null,
      merchantKey: merchantKey(description),
      bankCategory,
      externalId,
      dedupKey: dedupKey({ date, amountCents, description, externalId }),
      ownerHint,
      ownerId,
    };
  });
}
