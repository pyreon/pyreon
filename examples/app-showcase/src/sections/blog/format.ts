/**
 * Format an ISO 8601 date string for display in the post header
 * and post-card meta. Uses Intl so it picks up the user's locale
 * automatically.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
