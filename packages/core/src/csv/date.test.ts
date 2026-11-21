import { describe, expect, it } from 'vitest';
import { parseCsvDate } from './date.js';

describe('parseCsvDate', () => {
  it.each([
    ['10/05/2026', 'MM/dd/yyyy', '2026-10-05'],
    ['1/5/2026', 'MM/dd/yyyy', '2026-01-05'],
    ['10/3/2026', 'M/d/yyyy', '2026-10-03'],
    ['10/13/2026', 'M/d/yyyy', '2026-10-13'],
    ['2026-09-16', 'yyyy-MM-dd', '2026-09-16'],
    [' 2026-9-6 ', 'yyyy-MM-dd', '2026-09-06'],
    ['13/10/2026', 'dd/MM/yyyy', '2026-10-13'],
    ['02/29/2028', 'MM/dd/yyyy', '2028-02-29'],
  ] as const)('reads %j in %s as %s', (text, format, iso) => {
    expect(parseCsvDate(text, format)).toBe(iso);
  });

  it.each([
    ['13/45/2026', 'MM/dd/yyyy'],
    ['13/10/2026', 'MM/dd/yyyy'],
    ['10/13/2026', 'dd/MM/yyyy'],
    ['02/29/2026', 'MM/dd/yyyy'],
    ['04/31/2026', 'M/d/yyyy'],
    ['2026-10-05', 'MM/dd/yyyy'],
    ['10/05/2026', 'yyyy-MM-dd'],
    ['10/05/26', 'MM/dd/yyyy'],
    ['', 'yyyy-MM-dd'],
    ['2026-00-10', 'yyyy-MM-dd'],
    ['Oct 5 2026', 'M/d/yyyy'],
  ] as const)('rejects %j in %s', (text, format) => {
    expect(parseCsvDate(text, format)).toBeNull();
  });
});
