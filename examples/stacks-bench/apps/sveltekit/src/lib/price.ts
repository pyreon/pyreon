// Components cannot import #lib/server/* (https://svelte.dev/docs/kit/server-only-modules), so the
// one client-side helper is restated here — byte-for-byte the same as shared/data.ts formatPrice.
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
