import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/native-select';

const PAGE_SIZES = [25, 50, 100, 200] as const;

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
};

/** "1–50 of 637", previous and next, and the page size. */
export function Pagination({ page, pageSize, total, onPage, onPageSize }: Props) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const last = Math.min(page * pageSize, total);
  const sizes: readonly number[] = PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])
    ? PAGE_SIZES
    : [...PAGE_SIZES, pageSize].sort((a, b) => a - b);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span data-testid="range" className="text-muted-foreground tabular-nums">
        {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-2">
        <NativeSelect
          aria-label="Rows per page"
          className="w-auto"
          value={pageSize}
          onChange={(e) => {
            onPageSize(Number(e.target.value));
          }}
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            onPage(Math.min(page - 1, lastPage));
          }}
        >
          Previous
        </Button>
        <span className="tabular-nums">
          Page {page} of {lastPage}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
