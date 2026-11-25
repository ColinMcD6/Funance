import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  useAccounts,
  useBulkUpdateTransactions,
  useCategories,
  useOwners,
  useTransactions,
  useUpdateTransaction,
} from '@/api/queries';
import type { Lookups } from '@/pages/transactions/lookups';
import { MerchantGroup } from './merchant-group';
import {
  groupByMerchant,
  QUEUE_QUERY,
  queueActionFor,
  rulePatternFor,
  SHORTCUT_HELP,
  type QueueAction,
} from './queue';
import { RulePrompt, type RuleOffer } from './rule-prompt';

/**
 * Uncategorized: the queue of transactions with no category, oldest first and grouped by
 * merchant key. Each row offers its suggestion as a one-tap button and a full picker; a manual
 * choice offers to create a rule. Keyboard shortcuts move through the queue on a laptop.
 */
export function UncategorizedPage() {
  const list = useTransactions(QUEUE_QUERY);
  const owners = useOwners();
  const accounts = useAccounts();
  const categories = useCategories();
  const update = useUpdateTransaction();
  const bulk = useBulkUpdateTransactions();

  const lookups: Lookups = {
    owners: owners.data ?? [],
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
  };
  const loaded = list.data?.items ?? [];
  // Edits show at once (optimistically), so a categorized row leaves the queue before the refetch.
  const items = loaded.filter((t) => t.categoryId === null && !t.excluded);
  const remaining = (list.data?.total ?? 0) - (loaded.length - items.length);
  const groups = groupByMerchant(items);
  const rows = groups.flatMap((g) => g.items);

  // The active row is kept by id; when it leaves the queue, the row now in its place is next.
  const [active, setActive] = useState<{ id: number | null; index: number }>({
    id: null,
    index: 0,
  });
  const found = rows.findIndex((r) => r.id === active.id);
  const activeIndex =
    rows.length === 0 ? -1 : found !== -1 ? found : Math.min(active.index, rows.length - 1);
  const activeRow = rows[activeIndex];
  const activate = (index: number) => {
    const row = rows[index];
    if (row !== undefined) setActive({ id: row.id, index });
  };

  const [offer, setOffer] = useState<{ key: number; offer: RuleOffer } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function accept(ids: readonly number[], categoryId: number) {
    setMessage(null);
    const patch = { categoryId, categorySource: 'suggestion' as const };
    const [first] = ids;
    if (ids.length === 1 && first !== undefined) update.mutate({ id: first, patch });
    else bulk.mutate({ ids: [...ids], patch });
  }

  function pick(ids: readonly number[], categoryId: number) {
    setMessage(null);
    const [first] = ids;
    if (ids.length === 1 && first !== undefined)
      update.mutate({ id: first, patch: { categoryId } });
    else bulk.mutate({ ids: [...ids], patch: { categoryId } });
    const row = rows.find((r) => r.id === first);
    const category = lookups.categories.find((c) => c.id === categoryId);
    if (row !== undefined && category !== undefined) {
      setOffer((prev) => ({
        key: (prev?.key ?? 0) + 1,
        offer: { pattern: rulePatternFor(row.description, row.merchantKey), category },
      }));
    }
  }

  // Keyboard: after a shortcut, DOM focus follows the active row, so it scrolls into view and
  // the next row takes focus when the active one is categorized. A pointer press stops that.
  const container = useRef<HTMLDivElement>(null);
  const [followFocus, setFollowFocus] = useState(false);
  const rowElement = (id: number) =>
    container.current?.querySelector<HTMLElement>(`[data-row-id="${String(id)}"]`) ?? null;

  const activeId = activeRow?.id;
  useEffect(() => {
    if (!followFocus || activeId === undefined) return;
    const el = container.current?.querySelector<HTMLElement>(`[data-row-id="${String(activeId)}"]`);
    if (el == null || el.contains(document.activeElement)) return;
    el.focus();
  }, [followFocus, activeId]);

  function run(action: QueueAction): boolean {
    if (activeRow === undefined) return false;
    const suggestion = activeRow.suggestedCategoryId ?? null;
    switch (action) {
      case 'next':
        activate(Math.min(activeIndex + 1, rows.length - 1));
        return true;
      case 'previous':
        activate(Math.max(activeIndex - 1, 0));
        return true;
      case 'accept':
        if (suggestion !== null) accept([activeRow.id], suggestion);
        return true;
      case 'acceptGroup': {
        if (suggestion === null) return true;
        const ids = rows
          .filter(
            (r) => r.merchantKey === activeRow.merchantKey && r.suggestedCategoryId === suggestion,
          )
          .map((r) => r.id);
        accept(ids, suggestion);
        return true;
      }
      case 'pickCategory':
        rowElement(activeRow.id)
          ?.querySelector<HTMLElement>('select[aria-label="Category"]')
          ?.focus();
        return true;
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = queueActionFor(event);
      if (action === null) return;
      if (run(action)) {
        event.preventDefault();
        setFollowFocus(action !== 'pickCategory');
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  const error = list.error ?? update.error ?? bulk.error;

  return (
    <div
      ref={container}
      className="flex max-w-4xl flex-col gap-4"
      onPointerDown={() => {
        setFollowFocus(false);
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Uncategorized</h1>
        {list.isSuccess && (
          <p className="text-muted-foreground text-sm" data-testid="queue-count">
            {remaining} to categorize
          </p>
        )}
      </div>
      {rows.length > 0 && (
        <p className="text-muted-foreground hidden text-xs md:block" data-testid="shortcut-help">
          Keys:{' '}
          {SHORTCUT_HELP.map(([keys, what], i) => (
            <span key={keys}>
              {i > 0 && ' · '}
              <kbd className="font-mono">{keys}</kbd> {what}
            </span>
          ))}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      {message !== null && (
        <p role="status" className="text-sm" data-testid="queue-message">
          {message}
        </p>
      )}
      {offer !== null && (
        <RulePrompt
          key={offer.key}
          offer={offer.offer}
          onDone={(done) => {
            setOffer(null);
            setMessage(done);
          }}
        />
      )}
      {list.isSuccess && rows.length === 0 && (
        <p className="text-muted-foreground" data-testid="queue-empty">
          Nothing to categorize. Every transaction has a category.{' '}
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Review the month
          </Link>
        </p>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <MerchantGroup
              key={group.merchantKey}
              group={group}
              lookups={lookups}
              activeId={activeRow?.id ?? null}
              onActivate={(id) => {
                activate(rows.findIndex((r) => r.id === id));
              }}
              onAccept={accept}
              onPick={pick}
              onEdit={(id, patch) => {
                update.mutate({ id, patch });
              }}
            />
          ))}
        </div>
      )}
      {remaining > rows.length && rows.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Showing the oldest {rows.length} of {remaining}. The rest appear as these are done.
        </p>
      )}
    </div>
  );
}
