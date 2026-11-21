import type { TransactionPatch, TransactionQuery } from '@funance/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  useAccounts,
  useBulkUpdateTransactions,
  useCategories,
  useOwners,
  useTransactions,
  useUpdateTransaction,
} from '@/api/queries';
import { BulkActions } from './bulk-actions';
import { FilterBar } from './filter-bar';
import type { Lookups } from './lookups';
import { Pagination } from './pagination';
import {
  changeQuery,
  clearFilters,
  hasFilters,
  parseTransactionSearch,
  toTransactionSearch,
} from './transaction-filters';
import { TransactionCards } from './transaction-cards';
import { TransactionTable } from './transaction-table';

/**
 * Transactions: every transaction, filtered, sorted and paged by the URL, with inline owner and
 * category edits and bulk actions on selected rows.
 */
export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = parseTransactionSearch(searchParams);
  const queryKey = toTransactionSearch(query).toString();

  const list = useTransactions(query);
  const owners = useOwners();
  const accounts = useAccounts();
  const categories = useCategories();
  const update = useUpdateTransaction();
  const bulk = useBulkUpdateTransactions();

  // The selection belongs to one list: changing a filter, the sort or the page clears it.
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<number> }>({
    key: queryKey,
    ids: new Set(),
  });
  const selected = selection.key === queryKey ? selection.ids : new Set<number>();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const lookups: Lookups = {
    owners: owners.data ?? [],
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
  };
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  function navigate(next: TransactionQuery) {
    setBulkMessage(null);
    setSearchParams(toTransactionSearch(next));
  }
  const onChange = (change: Partial<TransactionQuery>) => {
    navigate(changeQuery(query, change));
  };

  function select(ids: ReadonlySet<number>) {
    setSelection({ key: queryKey, ids });
  }
  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    select(next);
  }
  function toggleAll() {
    const all = items.length > 0 && items.every((t) => selected.has(t.id));
    select(all ? new Set() : new Set(items.map((t) => t.id)));
  }
  function applyBulk(patch: TransactionPatch) {
    const ids = [...selected];
    bulk.mutate(
      { ids, patch },
      {
        onSuccess: ({ changed }) => {
          select(new Set());
          setBulkMessage(`Updated ${changed} of ${ids.length} selected transactions.`);
        },
      },
    );
  }

  const error = list.error ?? update.error ?? bulk.error;

  return (
    <div className="flex max-w-7xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <FilterBar
        query={query}
        lookups={lookups}
        onChange={onChange}
        onClear={
          hasFilters(query)
            ? () => {
                navigate(clearFilters(query));
              }
            : null
        }
      />
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      {bulkMessage !== null && (
        <p role="status" className="text-sm">
          {bulkMessage}
        </p>
      )}
      {selected.size > 0 && (
        <BulkActions
          count={selected.size}
          lookups={lookups}
          pending={bulk.isPending}
          onApply={applyBulk}
          onClear={() => {
            select(new Set());
          }}
        />
      )}
      {list.isSuccess && total === 0 && (
        <p className="text-muted-foreground">
          {hasFilters(query) ? 'No transactions match these filters.' : 'No transactions yet.'}
        </p>
      )}
      {items.length > 0 && (
        <div className={list.isPlaceholderData ? 'opacity-60' : undefined}>
          <TransactionTable
            items={items}
            lookups={lookups}
            query={query}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onSort={onChange}
            onEdit={(id, patch) => {
              update.mutate({ id, patch });
            }}
          />
          <TransactionCards
            items={items}
            lookups={lookups}
            selected={selected}
            onToggle={toggle}
            onEdit={(id, patch) => {
              update.mutate({ id, patch });
            }}
          />
        </div>
      )}
      {list.isSuccess && (total > 0 || query.page > 1) && (
        <Pagination
          page={query.page}
          pageSize={query.pageSize}
          total={total}
          onPage={(page) => {
            onChange({ page });
          }}
          onPageSize={(pageSize) => {
            onChange({ pageSize });
          }}
        />
      )}
    </div>
  );
}
