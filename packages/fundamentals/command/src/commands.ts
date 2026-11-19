import { getHotkeyConflicts, registerHotkey } from '@pyreon/hotkeys'
import type { Computed, Effect, Signal } from '@pyreon/reactivity'
import { batch, computed, effect, getCurrentScope, isServer, onCleanup, runUntracked, setCurrentScope, signal } from '@pyreon/reactivity'
import { createRanker } from './rank'
import type { MatchRange } from './match'
import { hasCommandModifier } from './shortcuts'
import type { Command, CommandGroup, Commands, CreateCommandsOptions, Match, RunContext, RunOptions, SearchOptions, Text } from './types'

const DEFAULT_RECENTS = 8
/** The most a recent command can gain: less than one word-start bonus, so recency settles close calls, never decides a clear one. */
const RECENT_BOOST = 10
const DESCRIPTION = 'command:'

function warn(message: string): void {
  if (process.env.NODE_ENV === 'production') return
  // oxlint-disable-next-line no-console
  console.warn(`[Pyreon] ${message}`)
}

/**
 * Run `fn` owned by no component. The registry's own machinery (the watcher below, and the default registry in
 * `context.ts`) is created lazily, from whichever component happens to need it first; owned by that component it would be
 * disposed with it while the registry kept pointing at it.
 */
export function detached<T>(fn: () => T): T {
  const prev = getCurrentScope()
  setCurrentScope(null)
  try {
    return runUntracked(fn)
  } finally {
    setCurrentScope(prev)
  }
}

function resolveText(text: Text | undefined): string | undefined {
  return typeof text === 'function' ? text() : text
}

export function isCommandEnabled(command: Command): boolean {
  const enabled = command.enabled
  return typeof enabled === 'function' ? enabled() : enabled !== false
}

interface Entry {
  readonly id: string
  readonly seq: number
  readonly read: () => Command
  /** The texts that are matched, title first, subtitle second ('' when absent), then the keywords. */
  readonly texts: () => readonly string[]
  /** `true` while this entry is the one that answers to its id. */
  readonly top: Signal<boolean>
  readonly dynamic: boolean
  readonly disposers: (() => void)[]
}

const fieldOf = (field: number, hasSubtitle: boolean): Match['field'] => (field === 0 ? 'title' : field === 1 && hasSubtitle ? 'subtitle' : 'keyword')

/** A registry of commands. See `Commands`. */
export function createCommands(options?: CreateCommandsOptions): Commands {
  const recentsMax = Math.max(0, options?.recents?.max ?? DEFAULT_RECENTS)
  const storage = options?.recents?.storage
  const onError = options?.onError

  const version = signal(0)
  const groupList = signal<readonly CommandGroup[]>(options?.groups ?? [])
  const recentIds = signal<readonly string[]>(loadRecents())
  const entries: Entry[] = []
  const byId = new Map<string, Entry[]>()
  const virtual = new WeakMap<Command, Entry[]>()
  const rankers = new Map<string, ReturnType<typeof createRanker<Entry>>>()
  const warnedConflicts = new Set<string>()
  let seq = 0
  let dynamicCount = 0
  let watcher: Effect | null = null
  let disposed = false
  let topEntries: Entry[] | null = null

  function loadRecents(): readonly string[] {
    if (storage === undefined || recentsMax === 0) return []
    try {
      const stored = storage.get()
      if (!Array.isArray(stored)) return []
      return stored.filter((id): id is string => typeof id === 'string').slice(0, recentsMax)
    } catch (error) {
      warn(`commands: reading the recents failed (${String(error)}); starting with none`)
      return []
    }
  }

  function bump(): void {
    topEntries = null
    version.set(version.peek() + 1)
  }

  // ---------------------------------------------------------------- entries

  function topList(): Entry[] {
    if (topEntries === null) {
      const list: Entry[] = []
      for (const entry of entries) if (entry.top.peek()) list.push(entry)
      topEntries = list
    }
    return topEntries
  }

  const topCommands = computed<readonly Command[]>(() => {
    version()
    return topList().map((entry) => entry.read())
  })

  function makeTexts(read: () => Command, dynamic: boolean): { texts: () => readonly string[]; dispose: () => void } {
    const build = (): string[] => {
      const c = read()
      return [resolveText(c.title) ?? '', resolveText(c.subtitle) ?? '', ...(c.keywords ?? [])]
    }
    if (!dynamic) {
      const fixed = build()
      return { texts: () => fixed, dispose: () => {} }
    }
    const cached = computed(build)
    return { texts: cached, dispose: () => cached.dispose?.() }
  }

  function isDynamic(command: Command, isGetter: boolean): boolean {
    return isGetter || typeof command.title === 'function' || typeof command.subtitle === 'function'
  }

  // ---------------------------------------------------------------- shortcuts

  function shortcutsOf(command: Command): string[] {
    const s = command.shortcut
    if (s === undefined) return []
    return (typeof s === 'string' ? [s] : [...s]).filter((x) => typeof x === 'string' && x.trim() !== '')
  }

  function warnConflicts(id: string): void {
    if (process.env.NODE_ENV === 'production') return
    for (const conflict of getHotkeyConflicts()) {
      const mine = conflict.descriptions.some((d) => d === DESCRIPTION + id)
      if (!mine) continue
      const names = conflict.descriptions.map((d, i) => (d?.startsWith(DESCRIPTION) ? `"${d.slice(DESCRIPTION.length)}"` : `another hotkey (${conflict.shortcuts[i]})`))
      const signature = `${conflict.scope}|${names.join(',')}|${conflict.shortcuts.join(',')}`
      if (warnedConflicts.has(signature)) continue
      if (warnedConflicts.size >= 100) warnedConflicts.clear()
      warnedConflicts.add(signature)
      warn(`commands: ${names.join(' and ')} share the shortcut "${conflict.shortcuts[0]}" in scope "${conflict.scope}", so both run when it is pressed. Give one of them another shortcut or disable it.`)
    }
  }

  function bindShortcuts(entry: Entry, isGetter: boolean, first: Command): void {
    if (!isGetter && shortcutsOf(first).length === 0) return
    // One string per distinct set of shortcuts while the command is on top and enabled: the effect below re-runs only
    // when that string changes, so a title or a subtitle that changed does not touch the hotkeys.
    const wanted = computed(() => {
      if (!entry.top()) return ''
      const command = entry.read()
      const shortcuts = shortcutsOf(command)
      if (shortcuts.length === 0 || !isCommandEnabled(command)) return ''
      return shortcuts.join('\n')
    })
    const run = effect(() => {
      const key = wanted()
      if (key === '') return
      const unregister: (() => void)[] = []
      for (const shortcut of key.split('\n')) {
        try {
          unregister.push(
            registerHotkey(
              shortcut,
              () => {
                void execute(entry.id, { source: 'shortcut' }).catch((error: unknown) => reportError(error, entry.read()))
              },
              { enableOnInputs: hasCommandModifier(shortcut), description: DESCRIPTION + entry.id },
            ),
          )
        } catch (error) {
          warn(`commands: the shortcut ${JSON.stringify(shortcut)} of "${entry.id}" could not be registered: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      runUntracked(() => warnConflicts(entry.id))
      onCleanup(() => {
        for (const u of unregister) u()
      })
    })
    entry.disposers.push(
      () => run.dispose(),
      () => wanted.dispose?.(),
    )
  }

  function reportError(error: unknown, command: Command): void {
    if (onError !== undefined) {
      onError(error, command)
      return
    }
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.error(`[Pyreon] command "${command.id}" failed`, error)
    }
  }

  // ---------------------------------------------------------------- watching dynamic texts

  function ensureWatcher(): void {
    if (watcher !== null || dynamicCount === 0) return
    // Narrowing reuses the previous candidates, which is only right while the texts are the same: a title that follows
    // the locale (or a getter command) resets every ranker when it changes. One effect reads them all (each read is a
    // cached computed), so a registry of plain titles pays nothing.
    watcher = detached(() =>
      effect(() => {
        version()
        for (const entry of entries) if (entry.dynamic) entry.texts()
        for (const ranker of rankers.values()) ranker.reset()
      }),
    )
  }

  function rankerFor(key: string): ReturnType<typeof createRanker<Entry>> {
    let ranker = rankers.get(key)
    if (ranker === undefined) {
      ranker = createRanker<Entry>((entry) => entry.texts())
      rankers.set(key, ranker)
    }
    return ranker
  }

  // ---------------------------------------------------------------- registration

  function makeEntry(source: Command | (() => Command)): Entry {
    const isGetter = typeof source === 'function'
    let read: () => Command
    let readComputed: Computed<Command> | null = null
    if (isGetter) {
      readComputed = computed(source)
      read = readComputed
    } else {
      const fixed = source
      read = () => fixed
    }
    const first = runUntracked(read)
    if (typeof first !== 'object' || first === null || typeof first.id !== 'string' || first.id === '') {
      throw new Error('[Pyreon] commands.register: a command needs a non-empty string `id`')
    }
    const id = first.id
    const dynamic = isDynamic(first, isGetter)
    const { texts, dispose: disposeTexts } = makeTexts(read, dynamic)
    const entry: Entry = {
      id,
      seq: seq++,
      read,
      texts,
      top: signal(false),
      dynamic,
      disposers: [disposeTexts, () => readComputed?.dispose?.()],
    }
    if (Array.isArray(first.children)) warnNestedShortcuts(first.children as readonly Command[])
    return entry
  }

  function warnNestedShortcuts(children: readonly Command[]): void {
    if (process.env.NODE_ENV === 'production') return
    for (const child of children) {
      if (child.shortcut !== undefined) warn(`commands: the command "${child.id}" is in a nested page and has a shortcut, which is not registered. Register it as a top-level command to give it a shortcut.`)
    }
  }

  function addEntries(sources: readonly (Command | (() => Command))[]): Entry[] {
    const added: Entry[] = []
    batch(() => {
      for (const source of sources) {
        const entry = makeEntry(source)
        entries.push(entry)
        let stack = byId.get(entry.id)
        if (stack === undefined) {
          stack = []
          byId.set(entry.id, stack)
        } else {
          warn(`commands: the id "${entry.id}" is registered twice; the latest registration answers to it until it is removed`)
          stack[stack.length - 1]?.top.set(false)
        }
        stack.push(entry)
        entry.top.set(true)
        if (entry.dynamic) dynamicCount++
        bindShortcuts(entry, typeof source === 'function', runUntracked(entry.read))
        added.push(entry)
      }
      bump()
    })
    ensureWatcher()
    return added
  }

  function removeEntries(removed: readonly Entry[]): void {
    if (removed.length === 0) return
    const gone = new Set(removed)
    batch(() => {
      for (const entry of removed) {
        const stack = byId.get(entry.id)
        if (stack !== undefined) {
          const at = stack.lastIndexOf(entry)
          if (at >= 0) {
            const wasTop = at === stack.length - 1
            stack.splice(at, 1)
            if (stack.length === 0) byId.delete(entry.id)
            else if (wasTop) stack[stack.length - 1]?.top.set(true)
          }
        }
        entry.top.set(false)
        if (entry.dynamic) dynamicCount--
        for (const dispose of entry.disposers) dispose()
        entry.disposers.length = 0
      }
      let write = 0
      for (let read = 0; read < entries.length; read++) {
        const entry = entries[read] as Entry
        if (!gone.has(entry)) entries[write++] = entry
      }
      entries.length = write
      bump()
    })
    if (dynamicCount === 0 && watcher !== null) {
      watcher.dispose()
      watcher = null
    }
  }

  function register(input: Command | readonly Command[] | (() => Command)): () => void {
    if (isServer || disposed) return () => {}
    const sources: (Command | (() => Command))[] = typeof input === 'function' ? [input] : Array.isArray(input) ? [...(input as readonly Command[])] : [input as Command]
    const added = runUntracked(() => addEntries(sources))
    let done = false
    const unregister = (): void => {
      if (done) return
      done = true
      removeEntries(added)
    }
    getCurrentScope()?.add(unregister)
    return unregister
  }

  function registerGroup(group: CommandGroup): () => void {
    if (isServer || disposed) return () => {}
    groupList.set([...groupList.peek().filter((g) => g.id !== group.id), group])
    let done = false
    return () => {
      if (done) return
      done = true
      if (groupList.peek().includes(group)) groupList.set(groupList.peek().filter((g) => g !== group))
    }
  }

  // ---------------------------------------------------------------- lookup

  function descendants(parent: Command, into: Map<string, Command>): void {
    const children = parent.children
    if (!Array.isArray(children)) return
    for (const child of children as readonly Command[]) {
      if (!into.has(child.id)) into.set(child.id, child)
      descendants(child, into)
    }
  }

  function find(id: string): Command | undefined {
    version()
    const stack = byId.get(id)
    const top = stack?.[stack.length - 1]
    if (top !== undefined) return top.read()
    for (const entry of topList()) {
      const found = new Map<string, Command>()
      descendants(entry.read(), found)
      const hit = found.get(id)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  function virtualEntries(parent: Command): Entry[] {
    let made = virtual.get(parent)
    if (made === undefined) {
      const children = Array.isArray(parent.children) ? (parent.children as readonly Command[]) : []
      made = children.map((child, i): Entry => {
        const read = (): Command => child
        const texts = (): readonly string[] => [resolveText(child.title) ?? '', resolveText(child.subtitle) ?? '', ...(child.keywords ?? [])]
        return { id: child.id, seq: i, read, texts, top: signal(true), dynamic: false, disposers: [] }
      })
      virtual.set(parent, made)
    }
    return made
  }

  // ---------------------------------------------------------------- search

  function groupIndex(id: string | undefined): number {
    if (id === undefined) return -1
    const at = groupList().findIndex((g) => g.id === id)
    return at
  }

  function toMatch(entry: Entry, score: number, field: number, ranges: readonly MatchRange[], recents: readonly string[]): Match {
    const command = entry.read()
    const enabled = isCommandEnabled(command)
    const hasSubtitle = resolveText(command.subtitle) !== undefined
    return {
      command,
      id: command.id,
      title: resolveText(command.title) ?? '',
      score,
      field: fieldOf(field, hasSubtitle),
      ranges: field === 0 || (field === 1 && hasSubtitle) ? ranges : [],
      group: command.group,
      enabled,
      disabledReason: enabled ? undefined : resolveText(command.disabledReason),
      recent: recents.includes(command.id),
    }
  }

  function search(query: string, searchOptions?: SearchOptions): readonly Match[] {
    if (isServer) return []
    version()
    const recents = recentIds()
    groupList()
    let pool: Entry[]
    let rankerKey = ''
    const parentId = searchOptions?.parent
    if (parentId === undefined) pool = topList()
    else {
      const parent = find(parentId)
      if (parent === undefined) return []
      pool = virtualEntries(parent)
      rankerKey = parentId
    }
    const includeDisabled = searchOptions?.includeDisabled === true
    const limit = searchOptions?.limit
    const out: Match[] = []

    if (query.trim() === '') {
      // Recents first (newest first), then the rest by group (declared order, ungrouped first) and registration.
      const recentRank = new Map(recents.map((id, i) => [id, i] as const))
      const ordered = pool
        .map((entry) => ({ entry, command: entry.read() }))
        .sort((a, b) => {
          const ra = parentId === undefined ? (recentRank.get(a.command.id) ?? Infinity) : Infinity
          const rb = parentId === undefined ? (recentRank.get(b.command.id) ?? Infinity) : Infinity
          if (ra !== rb) return ra < rb ? -1 : 1
          const ga = groupIndex(a.command.group)
          const gb = groupIndex(b.command.group)
          if (ga !== gb) return ga - gb
          const pa = a.command.priority ?? 0
          const pb = b.command.priority ?? 0
          if (pa !== pb) return pb - pa
          return a.entry.seq - b.entry.seq
        })
      for (const { entry } of ordered) {
        const m = toMatch(entry, 0, 0, [], recents)
        if (!m.enabled && !includeDisabled) continue
        out.push(m)
        if (limit !== undefined && out.length >= limit) break
      }
      return out
    }

    ensureWatcher()
    const ranker = rankerFor(rankerKey)
    const max = Math.max(1, recentsMax)
    const ranked = ranker.rank(query, pool, {
      boost: (entry) => {
        const at = recents.indexOf(entry.id)
        return at < 0 || parentId !== undefined ? 0 : Math.round((RECENT_BOOST * (max - at)) / max)
      },
      priority: (entry) => entry.read().priority ?? 0,
    })
    for (const r of ranked) {
      const m = toMatch(r.item, r.score, r.field, r.ranges, recents)
      if (!m.enabled && !includeDisabled) continue
      out.push(m)
      if (limit !== undefined && out.length >= limit) break
    }
    return out
  }

  // ---------------------------------------------------------------- running

  function mark(id: string): void {
    if (recentsMax === 0) return
    const next = [id, ...recentIds.peek().filter((x) => x !== id)].slice(0, recentsMax)
    recentIds.set(next)
    if (storage !== undefined) {
      try {
        storage.set([...next])
      } catch (error) {
        warn(`commands: saving the recents failed (${String(error)})`)
      }
    }
  }

  async function execute(target: string | Command, runOptions?: RunOptions): Promise<void> {
    const command = typeof target === 'string' ? runUntracked(() => find(target)) : target
    if (command === undefined) {
      throw new Error(`[Pyreon] commands.run: no command with the id "${String(target)}" is registered. It may belong to a screen that is not mounted.`)
    }
    if (!runUntracked(() => isCommandEnabled(command))) {
      const reason = resolveText(command.disabledReason)
      throw new Error(`[Pyreon] commands.run: "${command.id}" is disabled${reason === undefined ? '' : ` (${reason})`}`)
    }
    if (command.run === undefined) return
    const context: RunContext = {
      id: command.id,
      source: runOptions?.source ?? 'programmatic',
      query: runOptions?.query ?? '',
      signal: runOptions?.signal ?? new AbortController().signal,
      commands: api,
    }
    await command.run(context)
    mark(command.id)
  }

  const api: Commands = {
    register,
    registerGroup,
    commands: () => (isServer ? [] : topCommands()),
    groups: () => groupList(),
    get: (id) => (isServer ? undefined : find(id)),
    run: (target, runOptions) => execute(target, runOptions),
    search,
    recents: () => recentIds(),
    clearRecents() {
      recentIds.set([])
      if (storage !== undefined) {
        try {
          storage.set([])
        } catch (error) {
          warn(`commands: clearing the recents failed (${String(error)})`)
        }
      }
    },
    dispose() {
      if (disposed) return
      removeEntries([...entries])
      disposed = true
      watcher?.dispose()
      watcher = null
      rankers.clear()
      groupList.set([])
    },
  }
  return api
}
