import { computed, effect, isServer } from '@pyreon/reactivity'
import type { Computed } from '@pyreon/reactivity'
import { isCommandEnabled, resolveText, textsOf } from './entry'
import { fuzzyMatch } from './match'
import type { MatchRange } from './match'
import { rank } from './rank'
import type { PageFrame, PaletteCore } from './palette-core'
import type { ResultGroup, ResultItem } from './palette-types'
import { formatShortcut } from './shortcuts'
import { shortcutsOf } from './shortcut-binding'
import type { Command, CommandGroup, Match } from './types'

const RECENT_GROUP = '$recent'

function shortcutLabels(command: Command): string[] {
  if (isServer) return []
  const labels: string[] = []
  for (const shortcut of shortcutsOf(command)) {
    try {
      labels.push(formatShortcut(shortcut))
    } catch {
      // a shortcut hotkeys cannot parse is reported when the command registers; the row just shows none
    }
  }

  return labels
}

function hasPage(command: Command): boolean {
  return Array.isArray(command.children) || typeof command.children === 'function'
}

function toItem(command: Command, ranges: readonly MatchRange[], subtitleRanges: readonly MatchRange[], recent: boolean): Omit<ResultItem, 'index'> {
  const enabled = isCommandEnabled(command)

  return {
    id: command.id,
    command,
    title: resolveText(command.title) ?? '',
    subtitle: resolveText(command.subtitle),
    ranges,
    subtitleRanges,
    group: command.group,
    enabled,
    disabledReason: enabled ? undefined : resolveText(command.disabledReason),
    recent,
    hasPage: hasPage(command),
    shortcuts: shortcutLabels(command),
  }
}

function fromMatch(m: Match): Omit<ResultItem, 'index'> {
  const onTitle = m.field === 'title'

  return toItem(m.command, onTitle ? m.ranges : [], m.field === 'subtitle' ? m.ranges : [], m.recent)
}

/** The rows of an async page: the source decided what is listed; the query only highlights. */
function fromSource(commands: readonly Command[], query: string): Omit<ResultItem, 'index'>[] {
  return commands.map((command) => {
    const title = resolveText(command.title) ?? ''
    const hit = query.trim() === '' ? null : fuzzyMatch(query, title)

    return toItem(command, hit?.ranges ?? [], [], false)
  })
}

function unique(items: Omit<ResultItem, 'index'>[]): Omit<ResultItem, 'index'>[] {
  const seen = new Set<string>()

  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)

    return true
  })
}

function headingOf(id: string | undefined, declared: readonly CommandGroup[]): string | undefined {
  const group = id === undefined ? undefined : declared.find((g) => g.id === id)

  return group === undefined ? undefined : resolveText(group.title)
}

/** Items in contiguous groups, the groups in the order of their first item. */
function groupInOrder(items: Omit<ResultItem, 'index'>[], declared: readonly CommandGroup[]): { id: string | undefined; title: string | undefined; items: Omit<ResultItem, 'index'>[] }[] {
  const order: (string | undefined)[] = []
  const byId = new Map<string | undefined, Omit<ResultItem, 'index'>[]>()
  for (const item of items) {
    let list = byId.get(item.group)
    if (list === undefined) {
      list = []
      byId.set(item.group, list)
      order.push(item.group)
    }
    list.push(item)
  }

  return order.map((id) => ({ id, title: headingOf(id, declared), items: byId.get(id) as Omit<ResultItem, 'index'>[] }))
}

/** Declared group order (ungrouped first), then registration order. */
function declaredOrder(items: Omit<ResultItem, 'index'>[], declared: readonly CommandGroup[], registration: ReadonlyMap<string, number>): Omit<ResultItem, 'index'>[] {
  const groupIndex = (id: string | undefined): number => (id === undefined ? -1 : declared.findIndex((g) => g.id === id))

  return [...items].sort((a, b) => {
    const g = groupIndex(a.group) - groupIndex(b.group)

    return g !== 0 ? g : (registration.get(a.id) ?? 0) - (registration.get(b.id) ?? 0)
  })
}

function numbered(groups: { id: string | undefined; title: string | undefined; items: Omit<ResultItem, 'index'>[] }[]): ResultGroup[] {
  let index = 0

  return groups.map((g) => ({ id: g.id, title: g.title, items: g.items.map((item) => ({ ...item, index: index++ })) }))
}

type Mode = 'recents' | 'groups' | 'all'

/** What an empty query lists at the root, by mode. */
function emptyRootGroups(items: Omit<ResultItem, 'index'>[], mode: Mode, core: PaletteCore): ResultGroup[] {
  const declared = core.commands.groups()
  const registration = new Map(core.commands.commands().map((c, i) => [c.id, i] as const))
  if (mode === 'all') return numbered([{ id: undefined, title: undefined, items: [...items].sort((a, b) => (registration.get(a.id) ?? 0) - (registration.get(b.id) ?? 0)) }])
  const recents = mode === 'recents' ? items.filter((item) => item.recent) : []
  const rest = declaredOrder(
    items.filter((item) => !recents.includes(item)),
    declared,
    registration,
  )
  const groups = groupInOrder(rest, declared)
  if (recents.length > 0) groups.unshift({ id: RECENT_GROUP, title: core.messages.recent, items: recents })

  return numbered(groups)
}

/** The rows of a page the registry does not know (it came from an async source): ranked here, from the page's own list. */
function localItems(core: PaletteCore, query: string, children: readonly Command[]): Omit<ResultItem, 'index'>[] {
  const includeDisabled = core.options.showDisabled === true
  const usable = children.filter((command) => includeDisabled || isCommandEnabled(command))
  if (query.trim() === '') return usable.map((command) => toItem(command, [], [], false))

  return rank(query, usable, textsOf).map((r) => toItem(r.item, r.field === 0 ? r.ranges : [], r.field === 1 ? r.ranges : [], false))
}

/** The static rows: the registry's ranking, or the app's `filter` in registration order. */
function staticItems(core: PaletteCore, query: string, top: PageFrame | undefined, candidates: readonly Command[]): Omit<ResultItem, 'index'>[] {
  if (top?.external === true) return localItems(core, query, candidates)
  const includeDisabled = core.options.showDisabled === true
  const filter = core.options.filter
  if (filter === undefined) {
    return core.commands.search(query, { includeDisabled, ...(top === undefined ? {} : { parent: top.id }) }).map(fromMatch)
  }

  return candidates
    .filter((command) => filter(command, query) && (includeDisabled || isCommandEnabled(command)))
    .map((command) => toItem(command, [], [], false))
}

/** The rows of the `inline` sources, one group each, headed by the command that owns the source. Rows already listed are skipped. */
function inlineGroups(core: PaletteCore, query: string, listed: readonly Omit<ResultItem, 'index'>[]): { id: string | undefined; title: string | undefined; items: Omit<ResultItem, 'index'>[] }[] {
  core.inline.version()
  const seen = new Set(listed.map((item) => item.id))
  const out: { id: string | undefined; title: string | undefined; items: Omit<ResultItem, 'index'>[] }[] = []
  for (const command of inlineCommands(core)) {
    const rows = unique(fromSource(core.inline.results(command.id), query)).filter((row) => !seen.has(row.id))
    for (const row of rows) seen.add(row.id)
    if (rows.length > 0) out.push({ id: `$source:${command.id}`, title: resolveText(command.title), items: rows })
  }

  return out
}

/** The commands whose async source is searched from the root. */
function inlineCommands(core: PaletteCore): Command[] {
  return core.commands.commands().filter((command) => command.inline === true && typeof command.children === 'function' && isCommandEnabled(command))
}

/** The valid page stack: it stops at the first page whose command is no longer registered. */
function validPages(core: PaletteCore): PageFrame[] {
  const out: PageFrame[] = []
  for (const frame of core.frames()) {
    const command = frame.external === true ? frame.command : core.commands.get(frame.id)
    if (command === undefined) break
    out.push({ ...frame, command })
  }

  return out
}

export interface Results {
  readonly pages: Computed<PageFrame[]>
  readonly groups: Computed<ResultGroup[]>
  readonly items: Computed<readonly ResultItem[]>
  /** Stop the effect that asks the async source. */
  dispose(): void
}

/** The groups of rows for the page and the query on show. Async rows arrive through the source, latest answer wins. */
export function createResults(core: PaletteCore): Results {
  const pages = computed(() => validPages(core))
  const groups = computed<ResultGroup[]>(() => {
    if (!core.open() || isServer) return []
    const query = core.query()
    const top = pages().at(-1)
    if (top !== undefined && typeof top.command.children === 'function') return numbered(groupInOrder(unique(fromSource(core.source.results(), query)), core.commands.groups()))
    const children = top !== undefined && Array.isArray(top.command.children) ? (top.command.children as readonly Command[]) : core.commands.commands()
    const items = unique(staticItems(core, query, top, children))
    if (top === undefined && query.trim() === '') return emptyRootGroups(items, core.options.emptyQuery ?? 'recents', core)
    const listed = groupInOrder(items, core.commands.groups())
    if (top === undefined) listed.push(...inlineGroups(core, query, items))

    return numbered(listed)
  })
  const items = computed<readonly ResultItem[]>(() => groups().flatMap((g) => g.items))

  let asked: string | undefined
  const asking = isServer ? null : effect(() => {
    const top = core.open() ? pages().at(-1) : undefined
    const query = core.query()
    const load = top?.command.children
    if (top === undefined || typeof load !== 'function') {
      asked = undefined
      core.source.cancel()

      return
    }
    const entering = asked !== top.id
    asked = top.id
    if (entering) core.source.reset()
    core.source.request(load, query, entering)
  })

  const askingInline = isServer
    ? null
    : effect(() => {
        const query = core.query()
        const atRoot = core.open() && pages().length === 0 && query.trim() !== ''
        if (atRoot) core.inline.sync(inlineCommands(core), query)
        else core.inline.reset()
      })

  return {
    pages,
    groups,
    items,
    dispose() {
      asking?.dispose()
      askingInline?.dispose()
      items.dispose()
      groups.dispose()
      pages.dispose()
    },
  }
}
