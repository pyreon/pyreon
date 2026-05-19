import type { DevtoolsComponentEntry, SerializedEntry } from './types'

export type { DevtoolsComponentEntry } from './types'

export function serialize(entry: DevtoolsComponentEntry): SerializedEntry {
  return {
    id: entry.id,
    name: entry.name,
    parentId: entry.parentId,
    childIds: entry.childIds,
  }
}
