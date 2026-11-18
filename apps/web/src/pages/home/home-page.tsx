import { useEffect, useState } from 'react';
import { getHealth } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type HealthState =
  { kind: 'loading' } | { kind: 'ok'; version: string } | { kind: 'error'; message: string };

export function HomePage() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((res) => {
        if (!cancelled) setHealth({ kind: 'ok', version: res.version });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealth({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">Finance Tracker</h1>
          </CardTitle>
          <CardDescription>Household spending and income, on your home network.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <span>Server status:</span>
          {health.kind === 'loading' && (
            <Badge variant="secondary" data-testid="health-status">
              checking
            </Badge>
          )}
          {health.kind === 'ok' && (
            <>
              <Badge data-testid="health-status">ok</Badge>
              <span className="text-muted-foreground text-sm">v{health.version}</span>
            </>
          )}
          {health.kind === 'error' && (
            <>
              <Badge variant="destructive" data-testid="health-status">
                unreachable
              </Badge>
              <span className="text-muted-foreground text-sm">{health.message}</span>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
