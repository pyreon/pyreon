import { batch, computed, signal } from '@pyreon/reactivity'
import type { Computed, Signal } from '@pyreon/reactivity'
import type { Entry } from './entry'
import { detached, textsOf, warn } from './entry'
import type { Command, CommandGroup } from './types'

/** The registered entries and what keeps them consistent. Plain data: the functions below work on it. */
export interface Store {
  readonly entries: Entry[]
  /** Per id, the registrations in order: the last one answers to the id. */
  readonly byId: Map<string, Entry[]>
  readonly version: Signal<number>
  readonly groups: Signal<readonly CommandGroup[]>
  seq: number
  dynamicCount: number
  topEntries: Entry[] | null
  /** Changes whenever a text that is matched changed; see `textsEpoch`. */
  epoch: Computed<number> | null
  disposed: boolean
}

export function createStore(groups: readonly CommandGroup[]): Store {
  return { entries: [], byId: new Map(), version: signal(0), groups: signal(groups), seq: 0, dynamicCount: 0, topEntries: null, epoch: null, disposed: false }
}

export function bump(store: Store): void {
  store.topEntries = null
  store.version.set(store.version.peek() + 1)
}

/** The entries that answer to their id, in registration order. The same array until the next change. */
export function topList(store: Store): Entry[] {
  if (store.topEntries === null) store.topEntries = store.entries.filter((entry) => entry.top.peek())

  return store.topEntries
}

/** The ids of a command and of its nested pages, first one wins. */
function collectDescendants(parent: Command, into: Map<string, Command>): void {
  const children = parent.children
  if (!Array.isArray(children)) return
  for (const child of children as readonly Command[]) {
    if (!into.has(child.id)) into.set(child.id, child)
    collectDescendants(child, into)
  }
}

/** A top-level command by id, or one in a nested page. Reactive. */
export function findCommand(store: Store, id: string): Command | undefined {
  store.version()
  const stack = store.byId.get(id)
  const top = stack?.[stack.length - 1]
  if (top !== undefined) return top.read()
  for (const entry of topList(store)) {
    const found = new Map<string, Command>()
    collectDescendants(entry.read(), found)
    const hit = found.get(id)
    if (hit !== undefined) return hit
  }

  return undefined
}

/**
 * A number that changes whenever a text that is matched changed (a title that follows the locale, a function registration)
 * or the set of commands did. A ranker narrows only while it stays the same: reading it before ranking is what keeps
 * narrowing exact, whatever order the reactive graph settles in. It is a computed, so a registry of plain titles pays
 * nothing, and it is created outside any component: owned by the one that happened to search first it would be disposed
 * with it while the registry kept pointing at it.
 */
export function textsEpoch(store: Store): number {
  if (store.dynamicCount === 0) return 0
  store.epoch ??= detached(() => {
    let counter = 0

    return computed(() => {
      store.version()
      for (const entry of store.entries) if (entry.dynamic) entry.texts()

      return ++counter
    })
  })

  return store.epoch()
}

function warnNestedShortcuts(children: readonly Command[]): void {
  if (process.env.NODE_ENV === 'production') return
  for (const child of children) {
    if (child.shortcut !== undefined) warn(`commands: the command "${child.id}" is in a nested page and has a shortcut, which is not registered. Register it as a top-level command to give it a shortcut.`)
  }
}

function makeTexts(read: () => Command, dynamic: boolean): { texts: () => readonly string[]; dispose: () => void } {
  if (!dynamic) {
    const fixed = textsOf(read())

    return { texts: () => fixed, dispose: () => {} }
  }
  const cached = computed(() => textsOf(read()))

  return { texts: cached, dispose: () => cached.dispose() }
}

/** An entry for a command, or for a function that returns one (whose reads are then reactive). Not yet in the store. */
export function makeEntry(store: Store, source: Command | (() => Command)): Entry {
  const readComputed: Computed<Command> | null = typeof source === 'function' ? computed(source) : null
  const fixed = typeof source === 'function' ? null : source
  const read: () => Command = readComputed ?? (() => fixed as Command)
  const first = read()
  if (typeof first !== 'object' || first === null || typeof first.id !== 'string' || first.id === '') {
    throw new Error('[Pyreon] commands.register: a command needs a non-empty string `id`')
  }
  const dynamic = readComputed !== null || typeof first.title === 'function' || typeof first.subtitle === 'function'
  const { texts, dispose: disposeTexts } = makeTexts(read, dynamic)
  if (Array.isArray(first.children)) warnNestedShortcuts(first.children as readonly Command[])

  return { id: first.id, seq: store.seq++, read, texts, top: signal(false), dynamic, disposers: [disposeTexts, () => readComputed?.dispose()] }
}

/** Put an entry in the store; it becomes the one that answers to its id, and the previous one steps back. */
export function pushEntry(store: Store, entry: Entry): void {
  store.entries.push(entry)
  let stack = store.byId.get(entry.id)
  if (stack === undefined) {
    stack = []
    store.byId.set(entry.id, stack)
  } else {
    warn(`commands: the id "${entry.id}" is registered twice; the latest registration answers to it until it is removed`)
    stack[stack.length - 1]?.top.set(false)
  }
  stack.push(entry)
  entry.top.set(true)
  if (entry.dynamic) store.dynamicCount++
}

function releaseEntry(store: Store, entry: Entry): void {
  const stack = store.byId.get(entry.id)
  const at = stack === undefined ? -1 : stack.lastIndexOf(entry)
  if (stack !== undefined && at >= 0) {
    const wasTop = at === stack.length - 1
    stack.splice(at, 1)
    if (stack.length === 0) store.byId.delete(entry.id)
    else if (wasTop) stack[stack.length - 1]?.top.set(true)
  }
  entry.top.set(false)
  if (entry.dynamic) store.dynamicCount--
  for (const dispose of entry.disposers) dispose()
  entry.disposers.length = 0
}

/** Remove entries (once each), releasing what they hold, in one batch. */
export function removeEntries(store: Store, removed: readonly Entry[]): void {
  if (removed.length === 0) return
  const gone = new Set(removed)
  batch(() => {
    for (const entry of removed) releaseEntry(store, entry)
    let write = 0
    for (const entry of store.entries) if (!gone.has(entry)) store.entries[write++] = entry
    store.entries.length = write
    bump(store)
  })
  if (store.dynamicCount === 0 && store.epoch !== null) {
    store.epoch.dispose()
    store.epoch = null
  }
}
