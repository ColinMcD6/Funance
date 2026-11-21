/** Bank-added prefixes removed before the merchant name, matched on the uppercased text. */
const PREFIXES = [
  /^INTERAC - PURCHASE - /,
  /^VISA DEBIT - PURCHASE - /,
  /^SQ \*/,
  /^TST\* ?/,
  /^FH\* ?/,
];

const MAX_TOKENS = 3;

/**
 * PLAN.md section 2, "Merchant key": uppercase, collapse whitespace, remove a known prefix, drop
 * every `*` with the code attached to it, drop tokens containing digits, keep the first three
 * tokens. Commas also separate tokens. `WAL-MART #3177 WINNIPEG MB` → `WAL-MART WINNIPEG MB`.
 *
 * When nothing is left (a description made only of numbers), the cleaned description is used,
 * so the key is never empty for a non-empty description.
 */
export function merchantKey(description: string): string {
  let s = description.toUpperCase().replace(/\s+/g, ' ').trim();
  for (const prefix of PREFIXES) {
    if (prefix.test(s)) {
      s = s.replace(prefix, '');
      break;
    }
  }
  const cleaned = s.trim();
  const tokens = cleaned
    .replace(/\*\S*/g, ' ')
    .split(/[\s,]+/)
    .filter((t) => t !== '' && !/\d/.test(t));
  return tokens.length > 0 ? tokens.slice(0, MAX_TOKENS).join(' ') : cleaned;
}
