/**
 * Server-only guestbook store for the `/form-actions` probe. Imported ONLY by
 * the route's `action` handler and its `.server.ts` loader, so zero's action
 * transform must drop it from the client bundle: verify-modes asserts the
 * sentinel below appears in the server bundle and in NO client asset.
 */
const SERVER_ONLY_MARKER = 'ACTION_SERVER_ONLY_SENTINEL_z4k1'

const entries: string[] = []

export function addEntry(name: string): void {
  if (name === SERVER_ONLY_MARKER) throw new Error('reserved name')
  entries.push(name)
}

export function listEntries(): { entries: string[] } {
  return { entries: [...entries] }
}
