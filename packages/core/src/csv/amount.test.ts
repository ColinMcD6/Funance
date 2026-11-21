import { describe, expect, it } from 'vitest';
import { parseAmountCents } from './amount.js';

describe('parseAmountCents', () => {
  it.each([
    ['$1,200.00', 120000],
    ['-$1,200.00', -120000],
    ['$-1,200.00', -120000],
    ['(45.10)', -4510],
    ['($45.10)', -4510],
    ['0.01', 1],
    ['-0.01', -1],
    ['+12.5', 1250],
    ['1850.00', 185000],
    ['-61.20', -6120],
    [' 1 234.56 ', 123456],
    ['7', 700],
    ['.5', 50],
    ['3.', 300],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseAmountCents(text)).toEqual({ kind: 'ok', cents });
  });

  it('reads zero as positive zero, never -0', () => {
    for (const text of ['0.00', '-0.00', '(0.00)']) {
      const result = parseAmountCents(text);
      expect(result).toEqual({ kind: 'ok', cents: 0 });
      expect(result.kind === 'ok' && Object.is(result.cents, -0)).toBe(false);
    }
  });

  it.each(['', '   ', '$'])('reports %j as empty', (text) => {
    expect(parseAmountCents(text)).toEqual({ kind: 'empty' });
  });

  it.each(['abc', '12a', '1.234', '--5', '1.2.3', '-', '.', '()', '1e5', '(5'])(
    'rejects %j with a reason',
    (text) => {
      const result = parseAmountCents(text);
      expect(result.kind).toBe('invalid');
      expect(result.kind === 'invalid' && result.reason).toContain('Amount');
    },
  );

  it.each([
    ['1,234.56', 123456],
    ['$12,345,678.90', 1234567890],
    ['-1,000', -100000],
    ['(1,200.00)', -120000],
  ])('accepts thousands commas in groups of three: %j', (text, cents) => {
    expect(parseAmountCents(text)).toEqual({ kind: 'ok', cents });
  });

  it.each(['12,34', '45,10 $', '1,2,3', '1,23.00', ',123', '1234,567', '1,234,56'])(
    'rejects a comma that is not a thousands separator: %j',
    (text) => {
      const result = parseAmountCents(text);
      expect(result.kind).toBe('invalid');
      expect(result.kind === 'invalid' && result.reason).toContain(text.trim());
    },
  );

  it('rejects amounts beyond safe integer cents', () => {
    expect(parseAmountCents('99999999999999999').kind).toBe('invalid');
  });

  it('does not use floating-point arithmetic (0.29 is 29 cents, not 28)', () => {
    expect(parseAmountCents('0.29')).toEqual({ kind: 'ok', cents: 29 });
    expect(parseAmountCents('1.15')).toEqual({ kind: 'ok', cents: 115 });
  });
});
