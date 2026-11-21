import { describe, expect, it } from 'vitest';
import { centsToDollarText, parseDollars } from './dollars';
import {
  changeQuery,
  clearFilters,
  hasFilters,
  parseTransactionSearch,
  toTransactionSearch,
} from './transaction-filters';

const parse = (search: string) => parseTransactionSearch(new URLSearchParams(search));

describe('parseTransactionSearch', () => {
  it('gives the API defaults for an empty URL', () => {
    expect(parse('')).toEqual({ sort: 'date', order: 'desc', page: 1, pageSize: 50 });
  });

  it('reads every filter, sort and page', () => {
    expect(
      parse(
        'owner=2&account=none&category=7&from=2026-09-01&to=2026-09-30&q=costco&minCents=-5000&maxCents=0&excluded=false&sort=amount&order=asc&page=3&pageSize=25',
      ),
    ).toEqual({
      owner: 2,
      account: 'none',
      category: 7,
      from: '2026-09-01',
      to: '2026-09-30',
      q: 'costco',
      minCents: -5000,
      maxCents: 0,
      excluded: false,
      sort: 'amount',
      order: 'asc',
      page: 3,
      pageSize: 25,
    });
  });

  it('drops invalid and unknown values but keeps the valid ones', () => {
    expect(parse('owner=abc&from=2026-02-30&sort=owner&page=0&q=tim&extra=1')).toEqual({
      q: 'tim',
      sort: 'date',
      order: 'desc',
      page: 1,
      pageSize: 50,
    });
  });
});

describe('toTransactionSearch', () => {
  it('leaves out defaults and unset values, and round-trips', () => {
    const query = parse('category=none&q=tim&page=2');
    const search = toTransactionSearch(query).toString();
    expect(search).toBe('category=none&q=tim&page=2');
    expect(parse(search)).toEqual(query);
    expect(toTransactionSearch(parse('')).toString()).toBe('');
  });
});

describe('changeQuery and clearFilters', () => {
  it('goes back to page 1 on any change but a page change', () => {
    const query = parse('page=4&owner=1');
    expect(changeQuery(query, { owner: 2 }).page).toBe(1);
    expect(changeQuery(query, { page: 5 }).page).toBe(5);
  });

  it('clears filters but keeps the sort and page size', () => {
    const query = parse('owner=1&q=x&excluded=true&sort=amount&pageSize=25&page=3');
    expect(hasFilters(query)).toBe(true);
    const cleared = clearFilters(query);
    expect(hasFilters(cleared)).toBe(false);
    expect(toTransactionSearch(cleared).toString()).toBe('sort=amount&pageSize=25');
  });
});

describe('parseDollars', () => {
  it.each([
    ['', undefined],
    ['  ', undefined],
    ['12', 1200],
    ['12.5', 1250],
    ['-12.05', -1205],
    ['$1,200.00', 120000],
    ['-0', 0],
    ['0.01', 1],
    ['1.234', null],
    ['abc', null],
    ['1-2', null],
  ])('reads %j as %j', (text, cents) => {
    expect(parseDollars(text)).toBe(cents);
  });
});

describe('centsToDollarText', () => {
  it.each([
    [undefined, ''],
    [0, '0.00'],
    [5, '0.05'],
    [-1250, '-12.50'],
    [120000, '1200.00'],
  ])('shows %j as %j', (cents, text) => {
    expect(centsToDollarText(cents)).toBe(text);
  });
});
