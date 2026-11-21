import type { Owner } from '@funance/shared';
import { ServerStatus } from '@/components/server-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  /** Undefined while loading. */
  owners: Owner[] | undefined;
  loadError?: string;
  choosing: boolean;
  chooseError?: string;
  onChoose: (ownerId: number) => void;
};

/** Shown when no profile is chosen on this device: one button per person. */
export function ProfilePickerPage({ owners, loadError, choosing, chooseError, onChoose }: Props) {
  const people = owners?.filter((o) => o.kind === 'person') ?? [];
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">Finance Tracker</h1>
          </CardTitle>
          <CardDescription>Who is using the app on this device?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {owners === undefined && loadError === undefined && (
            <p className="text-muted-foreground text-sm">Loading profiles…</p>
          )}
          {loadError !== undefined && (
            <p role="alert" className="text-destructive text-sm">
              Could not load profiles: {loadError}
            </p>
          )}
          {people.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {people.map((owner) => (
                <Button
                  key={owner.id}
                  size="lg"
                  disabled={choosing}
                  onClick={() => {
                    onChoose(owner.id);
                  }}
                >
                  {owner.name}
                </Button>
              ))}
            </div>
          )}
          {chooseError !== undefined && (
            <p role="alert" className="text-destructive text-sm">
              {chooseError}
            </p>
          )}
          <ServerStatus />
        </CardContent>
      </Card>
    </main>
  );
}
