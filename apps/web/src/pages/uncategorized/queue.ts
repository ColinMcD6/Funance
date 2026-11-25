import type { TransactionListItem, TransactionQuery } from '@funance/shared';

/**
 * The queue's list query: every uncategorized row that counts in reports (excluded rows are left
 * out, as on the Dashboard), oldest first. 500 is the API's largest page.
 */
export const QUEUE_QUERY: TransactionQuery = {
  category: 'none',
  excluded: false,
  sort: 'date',
  order: 'asc',
  page: 1,
  pageSize: 500,
};

export type MerchantGroup = {
  merchantKey: string;
  items: TransactionListItem[];
  /** The suggestion every row shares, or null when they differ or there is none. */
  sharedSuggestionId: number | null;
};

/**
 * Rows grouped by merchant key, so repeated merchants are handled together. Groups come in the
 * order of their oldest row and keep their rows' order (oldest first).
 */
export function groupByMerchant(items: readonly TransactionListItem[]): MerchantGroup[] {
  const groups = new Map<string, TransactionListItem[]>();
  for (const item of items) {
    const group = groups.get(item.merchantKey) ?? [];
    group.push(item);
    groups.set(item.merchantKey, group);
  }
  return [...groups].map(([merchantKey, rows]) => {
    const first = rows[0]?.suggestedCategoryId ?? null;
    const shared = rows.every((r) => (r.suggestedCategoryId ?? null) === first);
    return { merchantKey, items: rows, sharedSuggestionId: shared ? first : null };
  });
}

/**
 * The pattern a "description contains" rule needs to catch this merchant: the longest run of
 * the merchant key's leading words that appears in the description as written. The merchant key
 * drops store numbers, so `WAL-MART WINNIPEG MB` from `WAL-MART #3177 WINNIPEG MB` gives
 * `WAL-MART`. Falls back to the whole description.
 */
export function rulePatternFor(description: string, merchantKey: string): string {
  const text = description.toUpperCase().replace(/\s+/g, ' ');
  const words = merchantKey.split(' ').filter((w) => w !== '');
  for (let n = words.length; n > 0; n--) {
    const candidate = words.slice(0, n).join(' ');
    if (text.includes(candidate)) return candidate;
  }
  return description.trim();
}

export type QueueAction = 'next' | 'previous' | 'accept' | 'acceptGroup' | 'pickCategory';

const KEYS: Record<string, QueueAction> = {
  j: 'next',
  ArrowDown: 'next',
  k: 'previous',
  ArrowUp: 'previous',
  a: 'accept',
  Enter: 'accept',
  g: 'acceptGroup',
  c: 'pickCategory',
};

/** Keyboard shortcuts shown on the page, in the order they are listed. */
export const SHORTCUT_HELP: readonly [string, string][] = [
  ['J / ↓', 'next'],
  ['K / ↑', 'previous'],
  ['A / Enter', 'accept the suggestion'],
  ['G', 'accept it for the whole merchant'],
  ['C', 'choose a category'],
];

const TYPING_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const PRESSABLE_TAGS = new Set(['BUTTON', 'A']);

/**
 * The queue action for a key press, or null. Keys typed into a form control, Enter on a button
 * or link, and presses with Ctrl, Alt or Meta are left to the browser.
 */
export function queueActionFor(event: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}): QueueAction | null {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  const target = event.target;
  if (target instanceof HTMLElement) {
    if (target.isContentEditable || TYPING_TAGS.has(target.tagName)) return null;
    if (event.key === 'Enter' && PRESSABLE_TAGS.has(target.tagName)) return null;
  }
  return KEYS[event.key] ?? KEYS[event.key.toLowerCase()] ?? null;
}
