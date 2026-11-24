import { isServer, signal } from '@pyreon/reactivity'
import type { Entry, Registry } from './entry'
import { isCommandEnabled, resolveText, textsOf } from './entry'
import type { MatchRange } from './match'
import { createRanker } from './rank'
import type { Recents } from './recents'
import type { Command, Match, SearchOptions } from './types'

/** The most a recent command can gain: less than one word-start bonus, so recency settles close calls and never decides a clear one. */
const RECENT_BOOST = 10

type EntryRanker = ReturnType<typeof createRanker<Entry>>

function fieldOf(field: number, hasSubtitle: boolean): Match['field'] {
  if (field === 0) return 'title'

  return field === 1 && hasSubtitle ? 'subtitle' : 'keyword'
}

function toMatch(entry: Entry, score: number, field: number, ranges: readonly MatchRange[], recents: readonly string[]): Match {
  const command = entry.read()
  const enabled = isCommandEnabled(command)
  const hasSubtitle = resolveText(command.subtitle) !== undefined
  const onTitleOrSubtitle = field === 0 || (field === 1 && hasSubtitle)

  return {
    command,
    id: command.id,
    title: resolveText(command.title) ?? '',
    score,
    field: fieldOf(field, hasSubtitle),
    ranges: onTitleOrSubtitle ? ranges : [],
    group: command.group,
    enabled,
    disabledReason: enabled ? undefined : resolveText(command.disabledReason),
    recent: recents.includes(command.id),
  }
}

/** The entries of a nested page, made once per parent command and dropped with it. */
function pageEntries(parent: Command, cache: WeakMap<Command, Entry[]>): Entry[] {
  let made = cache.get(parent)
  if (made === undefined) {
    const children = Array.isArray(parent.children) ? (parent.children as readonly Command[]) : []
    made = children.map((child, seq): Entry => ({ id: child.id, seq, read: () => child, texts: () => textsOf(child), top: signal(true), dynamic: false, disposers: [] }))
    cache.set(parent, made)
  }

  return made
}

/** Recents first (newest first), then ungrouped commands, then the groups in declared order; registration order within each. */
function emptyQueryOrder(pool: readonly Entry[], recents: readonly string[], groupIds: readonly string[], useRecents: boolean): Entry[] {
  const recentRank = new Map(recents.map((id, i) => [id, i] as const))
  const groupIndex = (id: string | undefined): number => (id === undefined ? -1 : groupIds.indexOf(id))

  return pool
    .map((entry) => ({ entry, command: entry.read() }))
    .sort((a, b) => {
      const ra = useRecents ? (recentRank.get(a.command.id) ?? Infinity) : Infinity
      const rb = useRecents ? (recentRank.get(b.command.id) ?? Infinity) : Infinity
      if (ra !== rb) return ra < rb ? -1 : 1
      const ga = groupIndex(a.command.group)
      const gb = groupIndex(b.command.group)
      if (ga !== gb) return ga - gb
      const pa = a.command.priority ?? 0
      const pb = b.command.priority ?? 0
      if (pa !== pb) return pb - pa

      return a.entry.seq - b.entry.seq
    })
    .map((x) => x.entry)
}

/** The search of a registry: ranks the top-level commands, or the commands of a nested page. */
export function createSearch(registry: Registry, recents: Recents): { search(query: string, options?: SearchOptions): readonly Match[]; clear(): void } {
  const rankers = new Map<string, EntryRanker>()
  const pages = new WeakMap<Command, Entry[]>()
  let lastEpoch = 0

  function rankerFor(key: string): EntryRanker {
    let ranker = rankers.get(key)
    if (ranker === undefined) {
      ranker = createRanker<Entry>((entry) => entry.texts())
      rankers.set(key, ranker)
    }

    return ranker
  }

  function pool(parentId: string | undefined): Entry[] | null {
    if (parentId === undefined) return registry.topList()
    const parent = registry.find(parentId)

    return parent === undefined ? null : pageEntries(parent, pages)
  }

  function search(query: string, options?: SearchOptions): readonly Match[] {
    if (isServer) return []
    registry.version()
    const recent = recents.ids()
    const groupIds = registry.groups().map((g) => g.id)
    const parentId = options?.parent
    const entries = pool(parentId)
    if (entries === null) return []
    const limit = options?.limit
    const out: Match[] = []
    const push = (m: Match): boolean => {
      if (!m.enabled && options?.includeDisabled !== true) return false
      out.push(m)

      return limit !== undefined && out.length >= limit
    }

    if (query.trim() === '') {
      for (const entry of emptyQueryOrder(entries, recent, groupIds, parentId === undefined)) if (push(toMatch(entry, 0, 0, [], recent))) break

      return out
    }

    if (registry.epoch() !== lastEpoch) {
      lastEpoch = registry.epoch()
      for (const ranker of rankers.values()) ranker.reset()
    }
    const max = Math.max(1, recents.max)
    const ranked = rankerFor(parentId ?? '').rank(query, entries, {
      boost: (entry) => {
        const at = parentId === undefined ? recent.indexOf(entry.id) : -1

        return at < 0 ? 0 : Math.round((RECENT_BOOST * (max - at)) / max)
      },
      priority: (entry) => entry.read().priority ?? 0,
    })
    for (const r of ranked) if (push(toMatch(r.item, r.score, r.field, r.ranges, recent))) break

    return out
  }

  return {
    search,
    clear() {
      rankers.clear()
    },
  }
}
