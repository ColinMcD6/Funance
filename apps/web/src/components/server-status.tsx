import { useHealth } from '@/api/queries';
import { Badge } from '@/components/ui/badge';

/** The server health badge: checking, ok with the version, or unreachable with the reason. */
export function ServerStatus() {
  const health = useHealth();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Server status:</span>
      {health.isPending && (
        <Badge variant="secondary" data-testid="health-status">
          checking
        </Badge>
      )}
      {health.isSuccess && (
        <>
          <Badge data-testid="health-status">ok</Badge>
          <span className="text-muted-foreground">v{health.data.version}</span>
        </>
      )}
      {health.isError && (
        <>
          <Badge variant="destructive" data-testid="health-status">
            unreachable
          </Badge>
          <span className="text-muted-foreground">{health.error.message}</span>
        </>
      )}
    </div>
  );
}
