import type { SerializedEntry } from './types'

export function buildMap(
  entries: SerializedEntry[],
): Map<string, SerializedEntry> {
  const map = new Map<string, SerializedEntry>()
  for (const entry of entries) {
    map.set(entry.id, entry)
  }
  return map
}

export function getRoots(entries: SerializedEntry[]): SerializedEntry[] {
  return entries.filter((e) => e.parentId === null)
}
