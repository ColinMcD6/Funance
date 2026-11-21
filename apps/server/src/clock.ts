/** Returns the current time as ISO 8601 UTC text. Injected so tests never depend on the real date. */
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();

/** A clock frozen at `timestamp`, for tests and deterministic seeding. */
export function fixedClock(timestamp: string): Clock {
  return () => timestamp;
}
