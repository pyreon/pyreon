/**
 * Named bindings — the Reactive coverage panel's rows.
 *
 * Every DOM binding the PREVIEWED component created, by name
 * (`aria-busy ← loading`), with how often it updated and whether it ever did.
 * Built from the reactive graph plus the model's `PreviewScope`, which says
 * which nodes are the component's (its mount windows, its live control
 * values) rather than the workbench's around it.
 *
 * Pure, like ./reactive-coverage, and a module of its own so it loads with
 * the coverage panel only — the Update cause panel shares
 * ./reactive-coverage and has no use for this.
 */
import type { ReactiveBindingKind, ReactiveGraph, ReactiveNode } from '@pyreon/reactivity'
import type { PreviewScope } from './model'

/** How a binding row reads in the `kind` column. */
const KIND_LABEL: Record<ReactiveBindingKind, string> = {
  text: 'text node',
  attr: 'attribute',
  class: 'class',
  style: 'style',
  prop: 'property',
  child: 'child',
  list: 'list',
  dom: 'direct write',
}

/** What a binding writes, when the graph has no attribute name for it. */
const WHAT: Record<ReactiveBindingKind, string> = {
  text: 'text',
  attr: 'attribute',
  class: 'class',
  style: 'style',
  prop: 'property',
  child: 'content',
  list: 'list',
  dom: 'DOM write',
}

/** `covered` — updated at least once; `never` — never updated; `rebuilt` — never updated in place, re-created by a re-mount instead. */
export type BindingStatus = 'covered' | 'never' | 'rebuilt'

export interface BindingRow {
  /** Stable across re-mounts: the binding's name plus its position among same-named bindings. */
  id: string
  kind: ReactiveBindingKind
  /** The `kind` column: `attribute`, `text node`, … */
  kindLabel: string
  /** What it writes: the attribute or property name, else `text` / `class` / `content` / … */
  what: string
  /** The element it writes, as `<span>`, or `''` when the graph does not know it. */
  element: string
  /** The named sources it reads: control keys first (in control order), then named signals. */
  sources: string[]
  /** Sources it reads that have no name (an anonymous signal inside the component). */
  unnamed: number
  /** Workbench state it reads (`theme`, `mode`) — listed in `sources` after the rest. */
  workbench: string[]
  /** `what ← sources`, the row's title. */
  name: string
  /** Updates after its first run, summed over every mount of it in the session. */
  fires: number
  status: BindingStatus
  /** How many times the preview created it (> 1 when the preview re-mounted). */
  mounts: number
  /** For an uncovered binding: what would exercise it. Empty when covered. */
  hint: string
}

export interface BindingControl {
  key: string
  label: string
}

const UNNAMED = /^(signal|derived|effect)#\d+$/

/**
 * The nodes of the graph that belong to the previewed component: every node
 * created inside one of its mount windows, its live control values, and
 * anything downstream of either (a binding the component created later, when
 * a `<Show>` opened). Atlas's own nodes inside the preview are excluded, and
 * never traversed — the remount watcher reads the control values, and what it
 * drives is the workbench, not the component.
 */
export function componentNodes(graph: ReactiveGraph, scope: PreviewScope): Set<number> {
  const out = new Set<number>()
  if (scope.mounts.length === 0) return out
  const down = new Map<number, number[]>()
  for (const e of graph.edges) {
    const list = down.get(e.from)
    if (list) list.push(e.to)
    else down.set(e.from, [e.to])
  }
  const queue: number[] = []
  for (const n of graph.nodes) {
    if (scope.ignore.has(n.id)) continue
    if (scope.props.has(n.id) || scope.mounts.some((m) => n.id > m.start && n.id < m.end)) {
      out.add(n.id)
      queue.push(n.id)
    }
  }
  const known = new Set(graph.nodes.map((n) => n.id))
  while (queue.length > 0) {
    const id = queue.pop() as number
    for (const to of down.get(id) ?? []) {
      if (out.has(to) || scope.ignore.has(to) || !known.has(to)) continue
      out.add(to)
      queue.push(to)
    }
  }
  return out
}

/**
 * The named sources a node reads, walking up through derived values to the
 * signals (or live control values) at the top. Bounded: a derived chain deeper
 * than this is reported by its first named sources, which is what a row needs.
 */
function sourcesOf(
  id: number,
  up: ReadonlyMap<number, number[]>,
  byId: ReadonlyMap<number, ReactiveNode>,
  scope: PreviewScope,
): { keys: Set<string>; named: Set<string>; workbench: Set<string>; unnamed: number } {
  const keys = new Set<string>()
  const workbench = new Set<string>()
  const named = new Set<string>()
  let unnamed = 0
  const seen = new Set<number>([id])
  let frontier = up.get(id) ?? []
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const next: number[] = []
    for (const from of frontier) {
      if (seen.has(from) || scope.ignore.has(from)) continue
      seen.add(from)
      const key = scope.props.get(from)
      if (key !== undefined) {
        keys.add(key)
        continue
      }
      const context = scope.context.get(from)
      if (context !== undefined) {
        workbench.add(context)
        continue
      }
      const node = byId.get(from)
      if (!node) continue
      const parents = up.get(from) ?? []
      if (node.kind === 'signal' || parents.length === 0) {
        if (UNNAMED.test(node.name)) unnamed += node.kind === 'signal' ? 1 : 0
        else named.add(node.name)
        continue
      }
      next.push(...parents)
    }
    frontier = next
  }
  return { keys, named, workbench, unnamed }
}

function hintFor(
  row: Pick<BindingRow, 'status' | 'sources' | 'unnamed' | 'workbench'>,
  keys: ReadonlySet<string>,
  scope: PreviewScope,
  controls: readonly BindingControl[],
): string {
  if (row.status === 'covered') return ''
  const control = (key: string) => controls.find((c) => c.key === key)
  if (row.status === 'rebuilt') {
    const key = [...keys].find((k) => scope.remount.has(k)) ?? [...keys][0] ?? ''
    return (
      `Changing \`${key}\` re-mounts the preview — the catalog's render reads it while rendering — ` +
      'so this binding is rebuilt, never updated in place. Read it inside the JSX (or pass it through) ' +
      'and Atlas can update it in place.'
    )
  }
  const unchanged = [...keys].filter((k) => !scope.changed.has(k))
  if (unchanged.length > 0) {
    const first = unchanged[0] as string
    const c = control(first)
    return c
      ? `Change “${c.label}” in Controls to exercise it.`
      : `Nothing in Controls drives \`${first}\` — set it from a scenario, or interact with the preview.`
  }
  if (keys.size > 0) {
    // Its control changed and it still did not re-run: it read the value
    // somewhere that is not tracked (a value captured at setup).
    return 'Its control changed and it did not re-run: the value it shows was read once, outside the binding. Open Lens to see where.'
  }
  const signals = row.sources
  if (signals.length > 0) {
    return `Interact with the preview so ${signals.map((n) => `\`${n}\``).join(', ')} changes.`
  }
  if (row.workbench.length > 0) {
    return 'It follows the preview theme: flip light/dark, or switch the brand, to exercise it.'
  }
  if (row.unnamed > 0) {
    return 'Interact with the preview: it reads state inside the component (an unnamed signal — give it a `name` to see it here).'
  }
  return 'It reads state created before this recording started (workbench or module state), so nothing in this session can re-run it.'
}

/**
 * One row per DOM binding of the previewed component, merged across re-mounts.
 *
 * A re-mount (a key the catalog's render reads itself, or Record restarting
 * the preview) creates the same bindings again as NEW nodes. They are the same
 * binding to the reader, so rows are keyed by name plus position among
 * same-named bindings within each mount, and an update in any mount counts.
 * The first run of every instance is its mount, never an update.
 *
 * Sorted with what needs attention first — never updated, then rebuilt — and
 * in creation (roughly DOM) order within each group.
 */
export function bindingRows(
  graph: ReactiveGraph,
  scope: PreviewScope,
  controls: readonly BindingControl[] = [],
): BindingRow[] {
  const members = componentNodes(graph, scope)
  if (members.size === 0) return []
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const up = new Map<number, number[]>()
  for (const e of graph.edges) {
    const list = up.get(e.to)
    if (list) list.push(e.from)
    else up.set(e.to, [e.from])
  }
  const generation = (id: number): number => {
    let g = 0
    for (let i = 0; i < scope.mounts.length; i++) if ((scope.mounts[i] as { start: number }).start < id) g = i
    return g
  }
  const order = new Map(controls.map((c, i) => [c.key, i]))

  interface Acc {
    row: BindingRow
    keys: Set<string>
    named: Set<string>
    workbench: Set<string>
    position: number
  }
  const rows = new Map<string, Acc>()
  const ordinal = new Map<string, number>()
  // Position within its own mount, so rows from different mounts interleave
  // by where they sit, not by when that mount happened.
  const nextPosition = new Map<number, number>()
  const bindings = graph.nodes
    .filter((n) => n.binding !== undefined && members.has(n.id))
    .sort((a, b) => a.id - b.id)
  for (const node of bindings) {
    const kind = node.binding as ReactiveBindingKind
    const what = node.key ?? WHAT[kind]
    const element = node.target ? `<${node.target}>` : ''
    const g = generation(node.id)
    const base = `${what}\u0000${element}`
    const slot = `${g}\u0000${base}`
    const n = ordinal.get(slot) ?? 0
    ordinal.set(slot, n + 1)
    const id = `${base}\u0000${n}`
    const position = nextPosition.get(g) ?? 0
    nextPosition.set(g, position + 1)
    const src = sourcesOf(node.id, up, byId, scope)
    let acc = rows.get(id)
    if (!acc) {
      acc = {
        row: {
          id,
          kind,
          kindLabel: KIND_LABEL[kind],
          what,
          element,
          sources: [],
          unnamed: 0,
          workbench: [],
          name: '',
          fires: 0,
          status: 'never',
          mounts: 0,
          hint: '',
        },
        keys: new Set(),
        named: new Set(),
        workbench: new Set(),
        position,
      }
      rows.set(id, acc)
    }
    acc.position = Math.min(acc.position, position)
    acc.row.fires += Math.max(0, node.fires - 1)
    acc.row.mounts += 1
    acc.row.unnamed = Math.max(acc.row.unnamed, src.unnamed)
    for (const k of src.keys) acc.keys.add(k)
    for (const s of src.named) acc.named.add(s)
    for (const s of src.workbench) acc.workbench.add(s)
  }

  const out: Array<BindingRow & { position: number }> = []
  for (const acc of rows.values()) {
    const keys = [...acc.keys].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || a.localeCompare(b))
    const row = acc.row
    row.workbench = [...acc.workbench].sort()
    row.sources = [...keys, ...[...acc.named].sort(), ...row.workbench]
    const from =
      row.sources.length > 0
        ? row.sources.join(', ')
        : row.unnamed > 0
          ? 'component state'
          : 'pre-recording state'
    row.name = `${row.what} ← ${from}`
    row.status =
      row.fires > 0
        ? 'covered'
        : row.mounts > 1 && keys.some((k) => scope.remount.has(k))
          ? 'rebuilt'
          : 'never'
    row.hint = hintFor(
      { status: row.status, sources: [...acc.named], unnamed: row.unnamed, workbench: row.workbench },
      acc.keys,
      scope,
      controls,
    )
    // Within a group, what the reader can act on comes first: a binding a
    // control drives, then one that reads named state, then the rest.
    const actionable =
      keys.length > 0 ? 0 : acc.named.size > 0 || row.unnamed > 0 || acc.workbench.size > 0 ? 1 : 2
    out.push({ ...row, position: actionable * 1e6 + acc.position })
  }
  const rank: Record<BindingStatus, number> = { never: 0, rebuilt: 1, covered: 2 }
  return out
    .sort((a, b) => rank[a.status] - rank[b.status] || a.position - b.position)
    .map(({ position: _position, ...row }) => row)
}

/** The headline over the rows — the bar and the list read from the same numbers. */
export interface BindingSummary {
  total: number
  covered: number
  never: number
  rebuilt: number
  /** `covered / total × 100`, rounded to a whole number; `null` when there is nothing to measure. */
  percent: number | null
}

export function bindingSummary(rows: readonly BindingRow[]): BindingSummary {
  let covered = 0
  let never = 0
  let rebuilt = 0
  for (const r of rows) {
    if (r.status === 'covered') covered += 1
    else if (r.status === 'rebuilt') rebuilt += 1
    else never += 1
  }
  const total = rows.length
  return {
    total,
    covered,
    never,
    rebuilt,
    // `null`, never 100: an empty list is "nothing to measure", and a bar
    // reading 100% over it would be the vacuous pass this panel refuses.
    percent: total === 0 ? null : Math.round((covered / total) * 100),
  }
}
