import { describe, expect, it } from 'vitest';
import { merchantKey } from './merchant.js';

describe('merchantKey', () => {
  it.each([
    // PLAN.md section 2 example.
    ['WAL-MART #3177 WINNIPEG MB', 'WAL-MART WINNIPEG MB'],
    ['Interac - Purchase - SHELL C12345 WINNIPEG  MB  CA', 'SHELL WINNIPEG MB'],
    [' Interac - Purchase -  SOBEYS 4567 WINNIPEG  MB  CA', 'SOBEYS WINNIPEG MB'],
    [
      'Visa Debit - Purchase - UBER CANADA/UBERTRIP TORONTO  ON  CA',
      'UBER CANADA/UBERTRIP TORONTO',
    ],
    ['AMZN Mktp CA*AB1CD2EF3 866-216-1072, ON', 'AMZN MKTP CA'],
    ['SQ *GREEN BEAN CAFE Winnipeg', 'GREEN BEAN CAFE'],
    ['TST* LAKESIDE BISTRO WINNIPEG MB', 'LAKESIDE BISTRO WINNIPEG'],
    ['TST*LAKESIDE BISTRO', 'LAKESIDE BISTRO'],
    ['FH* NORTHERN MOBILE WIRELESS', 'NORTHERN MOBILE WIRELESS'],
    ['SAFEWAY #1234, WINNIPEG MB', 'SAFEWAY WINNIPEG MB'],
    ['COSTCO WHOLESALE W1234 WINNIPEG MB', 'COSTCO WHOLESALE WINNIPEG'],
    ['EFT Deposit from Northwind Mfg', 'EFT DEPOSIT FROM'],
    ['PAYMENT - THANK YOU', 'PAYMENT - THANK'],
    ['Netflix', 'NETFLIX'],
  ])('%j → %j', (description, key) => {
    expect(merchantKey(description)).toBe(key);
  });

  it('removes only one prefix, at the start', () => {
    expect(merchantKey('REFUND Interac - Purchase - SHOP')).toBe('REFUND INTERAC -');
  });

  it('falls back to the cleaned description when every token has digits', () => {
    expect(merchantKey(' 12345  678 ')).toBe('12345 678');
    expect(merchantKey('')).toBe('');
  });
});
