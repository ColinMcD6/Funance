import { describe, expect, it } from 'vitest';
import {
  commitImportRequestSchema,
  compareReportQuerySchema,
  idParamSchema,
  monthlyReportQuerySchema,
  ruleInputSchema,
  transactionPatchSchema,
  transactionQuerySchema,
} from './api.js';
import { csvMappingSchema, type CsvMapping } from './csv-mapping.js';
import { budgetSchema, categorySchema } from './entities.js';
import { isIsoDate, isoDateSchema, timestampSchema, yearMonthSchema } from './primitives.js';

describe('dates', () => {
  it.each(['2026-01-31', '2024-02-29', '2000-02-29', '2026-12-01'])('accepts %s', (d) => {
    expect(isIsoDate(d)).toBe(true);
    expect(isoDateSchema.parse(d)).toBe(d);
  });

  it.each(['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-1-1', ''])(
    'rejects %s',
    (d) => {
      expect(isIsoDate(d)).toBe(false);
      expect(isoDateSchema.safeParse(d).success).toBe(false);
    },
  );

  it('validates months and timestamps', () => {
    expect(yearMonthSchema.safeParse('2026-09').success).toBe(true);
    expect(yearMonthSchema.safeParse('2026-13').success).toBe(false);
    expect(timestampSchema.safeParse('2026-11-18T12:00:00.000Z').success).toBe(true);
    expect(timestampSchema.safeParse('2026-11-18').success).toBe(false);
  });
});

describe('csvMappingSchema', () => {
  const base: CsvMapping = {
    encoding: 'utf-8',
    hasHeader: true,
    columns: { date: 'Date', description: ['Memo'], amount: 'Amount' },
    dateFormat: 'MM/dd/yyyy',
    amountSign: 'negative_is_outflow',
    skipZeroAmount: false,
  };

  it('accepts a single amount column', () => {
    expect(csvMappingSchema.parse(base)).toEqual(base);
  });

  it('accepts an outflow and inflow pair', () => {
    const mapping = {
      ...base,
      columns: { date: 'Date', description: ['D'], outflow: 'Out', inflow: 'In' },
    };
    expect(csvMappingSchema.safeParse(mapping).success).toBe(true);
  });

  it('rejects a mapping with no amount column or only half the pair', () => {
    const none = { ...base, columns: { date: 'Date', description: ['D'] } };
    const half = { ...base, columns: { date: 'Date', description: ['D'], outflow: 'Out' } };
    expect(csvMappingSchema.safeParse(none).success).toBe(false);
    expect(csvMappingSchema.safeParse(half).success).toBe(false);
  });

  it('requires at least one description column and owner ids in the hint map', () => {
    expect(
      csvMappingSchema.safeParse({ ...base, columns: { ...base.columns, description: [] } })
        .success,
    ).toBe(false);
    expect(
      csvMappingSchema.safeParse({ ...base, ownerHintMap: { 'ALEX SAMPLE': 0 } }).success,
    ).toBe(false);
  });
});

describe('entity schemas', () => {
  it('rejects a bad colour and a negative budget', () => {
    const category = {
      id: 1,
      name: 'Coffee',
      kind: 'expense',
      color: 'brown',
      sortOrder: 1,
      archived: false,
      groupName: 'Joy',
    };
    expect(categorySchema.safeParse(category).success).toBe(false);
    expect(categorySchema.safeParse({ ...category, color: '#92400e' }).success).toBe(true);
    const budget = { id: 1, categoryId: 1, ownerId: null, effectiveFrom: '2026-01' };
    expect(budgetSchema.safeParse({ ...budget, monthlyAmountCents: -1 }).success).toBe(false);
    expect(budgetSchema.safeParse({ ...budget, monthlyAmountCents: 50000 }).success).toBe(true);
  });
});

describe('query and path schemas', () => {
  it('coerces an id path parameter', () => {
    expect(idParamSchema.parse({ id: '42' })).toEqual({ id: 42 });
    expect(idParamSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: '0' }).success).toBe(false);
  });

  it('applies transaction query defaults', () => {
    expect(transactionQuerySchema.parse({})).toEqual({
      sort: 'date',
      order: 'desc',
      page: 1,
      pageSize: 50,
    });
  });

  it('parses every transaction filter from strings', () => {
    expect(
      transactionQuerySchema.parse({
        owner: '1',
        account: 'none',
        category: '7',
        from: '2026-01-01',
        to: '2026-01-31',
        q: '  walmart ',
        minCents: '-5000',
        maxCents: '0',
        excluded: 'false',
        sort: 'amount',
        order: 'asc',
        page: '2',
        pageSize: '25',
      }),
    ).toEqual({
      owner: 1,
      account: 'none',
      category: 7,
      from: '2026-01-01',
      to: '2026-01-31',
      q: 'walmart',
      minCents: -5000,
      maxCents: 0,
      excluded: false,
      sort: 'amount',
      order: 'asc',
      page: 2,
      pageSize: 25,
    });
    expect(transactionQuerySchema.parse({ category: 'none' }).category).toBe('none');
    expect(transactionQuerySchema.parse({ excluded: 'true' }).excluded).toBe(true);
  });

  it('rejects bad transaction filters', () => {
    for (const bad of [
      { pageSize: '501' },
      { page: '0' },
      { from: '2026-02-30' },
      { sort: 'owner' },
      { excluded: 'yes' },
      { category: 'some' },
    ]) {
      expect(transactionQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('defaults report owner and grouping', () => {
    expect(monthlyReportQuerySchema.parse({ from: '2026-01', to: '2026-03' })).toEqual({
      from: '2026-01',
      to: '2026-03',
      owner: 'all',
      groupBy: 'category',
    });
    expect(compareReportQuerySchema.parse({ month: '2026-03', owner: '2' })).toEqual({
      month: '2026-03',
      owner: 2,
    });
  });
});

describe('request bodies', () => {
  it('defaults commit skipLines and rule input fields', () => {
    expect(commitImportRequestSchema.parse({})).toEqual({ skipLines: [] });
    expect(
      ruleInputSchema.parse({
        priority: 10,
        matchField: 'description',
        matchType: 'contains',
        pattern: 'COSTCO',
        setCategoryId: 4,
      }),
    ).toEqual({
      priority: 10,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'COSTCO',
      accountId: null,
      direction: null,
      setCategoryId: 4,
      setOwnerId: null,
      enabled: true,
    });
  });

  it('only lets a transaction patch record manual or suggestion as the source', () => {
    expect(transactionPatchSchema.safeParse({ categorySource: 'suggestion' }).success).toBe(true);
    expect(transactionPatchSchema.safeParse({ categorySource: 'rule' }).success).toBe(false);
    expect(transactionPatchSchema.parse({ categoryId: null })).toEqual({ categoryId: null });
  });
});
