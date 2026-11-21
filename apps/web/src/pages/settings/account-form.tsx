import {
  ACCOUNT_TYPES,
  INSTITUTIONS,
  amountSignSchema,
  csvDateFormatSchema,
  csvEncodingSchema,
  type CreateAccountRequest,
  type CsvPreset,
  type Owner,
} from '@funance/shared';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  draftToRequest,
  withPreset,
  type AccountDraft,
  type OptionalColumn,
} from './account-draft';
import { OwnerHintEditor } from './owner-hint-editor';
import { SkipWhenEditor } from './skip-when-editor';

const COLUMN_LABELS: Record<OptionalColumn, string> = {
  postedDate: 'Posted date column',
  memo: 'Memo column',
  amount: 'Amount column (signed)',
  outflow: 'Outflow column',
  inflow: 'Inflow column',
  externalId: 'Reference number column',
  bankCategory: 'Bank category column',
  ownerHint: 'Owner hint column',
  accountFilter: 'Account filter column',
};

const INSTITUTION_LABELS: Record<(typeof INSTITUTIONS)[number], string> = {
  rbc: 'RBC',
  tangerine: 'Tangerine',
  simplii: 'Simplii',
  walmart: 'Walmart',
  other: 'Other',
};

const TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  chequing: 'Chequing',
  savings: 'Savings',
  credit_card: 'Credit card',
};

const SIGN_LABELS: Record<(typeof amountSignSchema.options)[number], string> = {
  negative_is_outflow: 'Negative is money out',
  positive_is_outflow: 'Positive is money out',
};

type Props = {
  initial: AccountDraft;
  owners: Owner[];
  presets: CsvPreset[];
  submitLabel: string;
  pending: boolean;
  serverError?: string;
  onSubmit: (request: CreateAccountRequest) => void;
};

/**
 * Account fields and the full CSV mapping. Choosing a preset fills the institution, type and
 * mapping; every mapping field stays editable afterwards.
 */
export function AccountForm({
  initial,
  owners,
  presets,
  submitLabel,
  pending,
  serverError,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState(initial);
  const [presetId, setPresetId] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  function set<K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function setColumn(key: OptionalColumn, value: string) {
    setDraft((d) => ({ ...d, columns: { ...d.columns, [key]: value } }));
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const result = draftToRequest(draft);
        if (result.ok) {
          setErrors([]);
          onSubmit(result.request);
        } else {
          setErrors(result.errors);
        }
      }}
    >
      <FormField label="Preset" hint="Fills the mapping below from a known bank export.">
        {(id) => (
          <NativeSelect
            id={id}
            value={presetId}
            onChange={(e) => {
              const preset = presets.find((p) => p.id === e.target.value);
              setPresetId(e.target.value);
              if (preset !== undefined) setDraft((d) => withPreset(d, preset));
            }}
          >
            <option value="">Choose a preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold">Account</legend>
        <FormField label="Name">
          {(id) => (
            <Input
              id={id}
              value={draft.name}
              maxLength={100}
              onChange={(e) => {
                set('name', e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label="Default owner">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.defaultOwnerId}
              onChange={(e) => {
                set('defaultOwnerId', e.target.value);
              }}
            >
              <option value="">Choose…</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Institution">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.institution}
              onChange={(e) => {
                set('institution', e.target.value as AccountDraft['institution']);
              }}
            >
              {INSTITUTIONS.map((i) => (
                <option key={i} value={i}>
                  {INSTITUTION_LABELS[i]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Type">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.type}
              onChange={(e) => {
                set('type', e.target.value as AccountDraft['type']);
              }}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold">CSV mapping</legend>
        <FormField label="Encoding">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.encoding}
              onChange={(e) => {
                set('encoding', e.target.value as AccountDraft['encoding']);
              }}
            >
              {csvEncodingSchema.options.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Date format">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.dateFormat}
              onChange={(e) => {
                set('dateFormat', e.target.value as AccountDraft['dateFormat']);
              }}
            >
              {csvDateFormatSchema.options.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Date column">
          {(id) => (
            <Input
              id={id}
              value={draft.dateColumn}
              onChange={(e) => {
                set('dateColumn', e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label="Description columns" hint="One per line; values are joined with a space.">
          {(id) => (
            <textarea
              id={id}
              rows={2}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
              value={draft.descriptionColumns}
              onChange={(e) => {
                set('descriptionColumns', e.target.value);
              }}
            />
          )}
        </FormField>
        {(Object.keys(COLUMN_LABELS) as OptionalColumn[]).map((key) => (
          <FormField key={key} label={COLUMN_LABELS[key]}>
            {(id) => (
              <Input
                id={id}
                value={draft.columns[key]}
                onChange={(e) => {
                  setColumn(key, e.target.value);
                }}
              />
            )}
          </FormField>
        ))}
        <FormField label="Amount sign" hint="For the single amount column.">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.amountSign}
              onChange={(e) => {
                set('amountSign', e.target.value as AccountDraft['amountSign']);
              }}
            >
              {amountSignSchema.options.map((v) => (
                <option key={v} value={v}>
                  {SIGN_LABELS[v]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Bank category pattern" hint="Regular expression with one capture group.">
          {(id) => (
            <Input
              id={id}
              value={draft.bankCategoryRegex}
              onChange={(e) => {
                set('bankCategoryRegex', e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label="Account filter value" hint="Only rows with this value are read.">
          {(id) => (
            <Input
              id={id}
              value={draft.accountFilterValue}
              onChange={(e) => {
                set('accountFilterValue', e.target.value);
              }}
            />
          )}
        </FormField>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="mapping-has-header"
              checked={draft.hasHeader}
              onCheckedChange={(v) => {
                set('hasHeader', v === true);
              }}
            />
            <Label htmlFor="mapping-has-header">First row is a header</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="mapping-skip-zero"
              checked={draft.skipZeroAmount}
              onCheckedChange={(v) => {
                set('skipZeroAmount', v === true);
              }}
            />
            <Label htmlFor="mapping-skip-zero">Skip zero-amount rows</Label>
          </div>
        </div>
      </fieldset>

      <OwnerHintEditor
        hints={draft.ownerHints}
        owners={owners}
        onChange={(hints) => {
          set('ownerHints', hints);
        }}
      />
      <SkipWhenEditor
        rules={draft.skipWhen}
        onChange={(rules) => {
          set('skipWhen', rules);
        }}
      />

      {(errors.length > 0 || serverError !== undefined) && (
        <div role="alert" className="text-destructive flex flex-col gap-1 text-sm">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
          {serverError !== undefined && <p>{serverError}</p>}
        </div>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
