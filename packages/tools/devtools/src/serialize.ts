import type { SerializedEntry } from './types'

export interface DevtoolsComponentEntry {
  id: string
  name: string
  el: Element | null
  parentId: string | null
  childIds: string[]
}

export function serialize(entry: DevtoolsComponentEntry): SerializedEntry {
  return {
    id: entry.id,
    name: entry.name,
    parentId: entry.parentId,
    childIds: entry.childIds,
  }
}
