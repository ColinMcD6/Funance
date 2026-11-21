import { csvPresetIdSchema, csvPresetSchema } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import { csvPresets, getCsvPreset } from './presets.js';

describe('csvPresets', () => {
  it('has exactly one valid preset per preset id', () => {
    expect(csvPresets.map((p) => p.id).sort()).toEqual([...csvPresetIdSchema.options].sort());
    for (const preset of csvPresets) {
      expect(csvPresetSchema.parse(preset)).toEqual(preset);
    }
  });

  it('getCsvPreset returns the preset by id', () => {
    for (const id of csvPresetIdSchema.options) {
      expect(getCsvPreset(id).id).toBe(id);
    }
  });

  it('getCsvPreset throws for an unknown id', () => {
    // Simulates a value that bypassed the type checker, such as one read from storage.
    const unknownId = 'nope' as Parameters<typeof getCsvPreset>[0];
    expect(() => getCsvPreset(unknownId)).toThrow(/Unknown CSV preset/);
  });

  it('copies the special handling listed in PLAN.md', () => {
    expect(getCsvPreset('tangerine-chequing').mapping.skipZeroAmount).toBe(true);
    expect(getCsvPreset('tangerine-mastercard').mapping.bankCategoryRegex).toBe('Category: (.+)$');
    expect(getCsvPreset('simplii').mapping.columns).toMatchObject({
      outflow: 'Funds Out',
      inflow: 'Funds In',
    });
    const walmart = getCsvPreset('walmart-mastercard').mapping;
    expect(walmart.amountSign).toBe('positive_is_outflow');
    expect(walmart.skipWhen).toEqual([{ column: 'Status', notEquals: 'APPROVED' }]);
    expect(walmart.columns.externalId).toBe('Reference Number');
    expect(getCsvPreset('rbc').mapping.columns.description).toEqual([
      'Description 1',
      'Description 2',
    ]);
  });
});
