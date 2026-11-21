import { CATEGORY_KINDS, type CategoryKind } from '@funance/shared';
import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Input } from '@/components/ui/input';
import { KIND_LABELS } from './kind-labels';

export type CategoryDraft = { name: string; kind: CategoryKind; color: string; groupName: string };

type Props = {
  draft: CategoryDraft;
  onChange: (draft: CategoryDraft) => void;
  /** Existing major categories, offered as suggestions for the group. */
  groups: readonly string[];
};

/** Name, kind, color and major category inputs, shared by the new and edit forms. */
export function CategoryFields({ draft, onChange, groups }: Props) {
  const listId = useId();
  const set = (patch: Partial<CategoryDraft>) => {
    onChange({ ...draft, ...patch });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Name">
        {(id) => (
          <Input
            id={id}
            value={draft.name}
            maxLength={100}
            required
            onChange={(e) => {
              set({ name: e.target.value });
            }}
          />
        )}
      </FormField>
      <FormField label="Major category">
        {(id) => (
          <>
            <Input
              id={id}
              list={listId}
              value={draft.groupName}
              maxLength={100}
              required
              onChange={(e) => {
                set({ groupName: e.target.value });
              }}
            />
            <datalist id={listId}>
              {groups.map((group) => (
                <option key={group} value={group} />
              ))}
            </datalist>
          </>
        )}
      </FormField>
      <FormField label="Kind" hint="Decides how its transactions count in reports.">
        {(id) => (
          <NativeSelect
            id={id}
            value={draft.kind}
            onChange={(e) => {
              set({ kind: e.target.value as CategoryKind });
            }}
          >
            {CATEGORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label="Color">
        {(id) => (
          <Input
            id={id}
            type="color"
            className="h-9 w-20 p-1"
            value={draft.color}
            onChange={(e) => {
              set({ color: e.target.value });
            }}
          />
        )}
      </FormField>
    </div>
  );
}
