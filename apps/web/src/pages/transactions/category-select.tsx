import type { Category } from '@funance/shared';
import type { ComponentProps } from 'react';
import { NativeSelect } from '@/components/native-select';

type Props = Omit<ComponentProps<'select'>, 'children'> & {
  categories: readonly Category[];
  /** Options shown before the categories, such as "All categories" or "Uncategorized". */
  leading: readonly { value: string; label: string }[];
  /** An archived category is listed only when it is the current value. */
  value: string;
};

/** A category picker grouped by major category, leaving out archived categories. */
export function CategorySelect({ categories, leading, value, ...props }: Props) {
  const groups = new Map<string, Category[]>();
  for (const category of categories) {
    if (category.archived && String(category.id) !== value) continue;
    const group = groups.get(category.groupName) ?? [];
    group.push(category);
    groups.set(category.groupName, group);
  }
  return (
    <NativeSelect value={value} {...props}>
      {leading.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {[...groups].map(([group, members]) => (
        <optgroup key={group} label={group}>
          {members.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.archived ? ' (archived)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}
