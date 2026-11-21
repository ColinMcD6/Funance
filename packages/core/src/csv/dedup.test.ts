import { describe, expect, it } from 'vitest';
import { dedupKey } from './dedup.js';
import { sha256Hex } from './sha256.js';

describe('dedupKey', () => {
  it('uses the external id when the file has one', () => {
    expect(
      dedupKey({ date: '2026-09-16', amountCents: -3022, description: 'X', externalId: 'REF1' }),
    ).toBe('REF1');
  });

  it('hashes date|amount|DESCRIPTION otherwise', () => {
    const key = dedupKey({
      date: '2026-10-05',
      amountCents: -6120,
      description: '  Interac - Purchase -  Shell\tC12345 ',
      externalId: null,
    });
    expect(key).toBe(sha256Hex('2026-10-05|-6120|INTERAC - PURCHASE - SHELL C12345'));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats an empty external id as absent', () => {
    const fields = { date: '2026-10-02', amountCents: -31, description: 'PURCHASE INTEREST' };
    expect(dedupKey({ ...fields, externalId: '' })).toBe(dedupKey({ ...fields, externalId: null }));
  });

  it('distinguishes amount and date', () => {
    const base = { date: '2026-10-05', amountCents: -100, description: 'A', externalId: null };
    const keys = new Set([
      dedupKey(base),
      dedupKey({ ...base, amountCents: 100 }),
      dedupKey({ ...base, date: '2026-10-06' }),
      dedupKey({ ...base, description: 'a' }),
    ]);
    expect(keys.size).toBe(3);
  });
});
