import { Decimal } from 'decimal.js';

/** Timestamp DB → ISO 8601 UTC. */
export function iso(value: Date): string {
  return value.toISOString();
}

export function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Nominal numeric → string desimal ternormalisasi (mis. "50000.00" → "50000"). */
export function money(value: Decimal.Value): string {
  return new Decimal(value).toFixed();
}
