/**
 * The `WorkbenchCatalog` — the data the `<Workbench>` renders. It fully
 * decouples the UI shell from WHAT it displays: a catalog is a flat list of
 * components, each carrying its control metadata + a `render(props)` function
 * that mounts the real thing. The example supplies a hand-written demo catalog;
 * the `atlas dev` CLI generates one from a project's discovered components.
 */
import type { VNodeChildAtom } from '@pyreon/core'
import type { Permissions } from '@pyreon/permissions'
import type { FakeQueryResult } from './query-states'

/** A single editable prop in the Controls panel. */
export interface WorkbenchControl {
  key: string
  label: string
  type: 'text' | 'enum' | 'bool' | 'number' | 'color'
  options?: readonly string[]
  default: unknown
  /**
   * Whether the component requires this prop.
   *
   * Rendered in the docs table, and the same fact `atlas check` reports as
   * `missing-required` — a props table that shows the shape but not which
   * parts are mandatory documents less than the validator does.
   */
  required?: boolean
}

/** Context handed to a component's `render` — lets the preview log events + write control values back. */
export interface WorkbenchRenderCtx {
  /** Log an interaction into the Actions panel. */
  logAction: (name: string, detail: string) => void
  /** Write a control value back (e.g. a controlled toggle updating its own `on`). */
  setValue: (key: string, value: unknown) => void
  /**
   * Props that force the pseudo state selected in the Pseudo-state addon —
   * `{ hover: true }`, `{ disabled: true }`, … or `{}` when none is forced.
   *
   * Spread it onto the component you render (`<Button {...ctx.pseudo}>`) to opt
   * in. rocketstyle treats `hover`/`focus`/`active` as reserved props that feed
   * `$rocketstate.pseudo`, so what renders is the component's REAL pseudo CSS,
   * not a lookalike class — the reason this addon needs no stylesheet rewriting
   * (which is how Storybook's equivalent has to work).
   *
   * A getter, so reading it inside `render` tracks the signal and the preview
   * re-renders when the forced state changes.
   */
  readonly pseudo: Record<string, boolean>
  /**
   * The locale selected in the Locale addon (a BCP-47 tag, `'en'` by default).
   *
   * Use it to render translated content — e.g. feed it to `@pyreon/i18n`'s
   * `createI18n({ locale })`, or index your own message map. The workbench
   * already sets `dir="rtl"` on the preview for RTL locales, so direction-
   * sensitive layout is exercised whether or not you translate anything.
   *
   * A getter, so reading it inside `render` tracks the signal and the preview
   * re-renders when the locale changes.
   */
  readonly locale: string
  /**
   * The permission checker for the role selected in the Roles panel.
   *
   * Guard privileged UI with it exactly as the app would
   * (`{() => ctx.can('posts.delete') && <DeleteButton/>}`). The workbench
   * RECORDS every key consulted, which is what lets the panel distinguish "this
   * component asked and was denied" from "this component never asked" — the
   * second being an unguarded action, and invisible to a plain role swap.
   *
   * A getter, so reading it inside `render` tracks the signal and the preview
   * re-renders when the role changes.
   */
  readonly can: Permissions
  /**
   * A fabricated query result for the state selected in the Data panel.
   *
   * Branch on it exactly as on a real `useQuery` result. The four states are
   * one selector rather than four hand-written stories plus a request mock,
   * and `refetching` is modelled faithfully — `status` stays `'success'` with
   * the previous data while `isFetching` is true — so a component that shows a
   * skeleton on refetch is visibly wrong here.
   *
   * A getter, so reading it inside `render` tracks the signal and the preview
   * re-renders when the state changes.
   */
  readonly query: FakeQueryResult
}

/** One catalog entry — a component the workbench can showcase. */
/**
 * Per-project presets for the built-in addons — the lists the workbench
 * renders its Viewport / Background / Locale / Roles pickers from.
 *
 * Every field is optional and every omission falls back to the shipped
 * defaults, so a project configures only what differs. All values are PLAIN
 * DATA (JSON-serializable): under `atlas dev` they travel from
 * `atlas.config.ts` through the scan into the generated catalog module — no
 * function crosses the Node→browser boundary except the wrapper, which has
 * its own import path.
 */
export interface WorkbenchPresets {
  /** `width: null` = fluid (the frame tracks the stage). */
  viewports?: readonly { id: string; label: string; width: number | null }[]
  /**
   * `color` is any CSS color for the preview surface. The shipped `checker`
   * transparency grid stays available by including `{ id: 'checker' }`.
   */
  backgrounds?: readonly { id: string; label: string; color?: string }[]
  locales?: readonly { id: string; label: string; dir?: 'ltr' | 'rtl' }[]
  /**
   * Roles for the permissions panel. `grants` lists EXACT keys the role is
   * granted; `verbs` grants any key whose last segment matches (the shipped
   * viewer/editor semantics); `defaultGrant` answers everything else.
   */
  roles?: readonly {
    id: string
    label: string
    hint?: string
    verbs?: readonly string[]
    grants?: readonly string[]
    defaultGrant?: boolean
  }[]
}

/**
 * A derived scenario, as the sidebar shows it — a named, concrete state of the
 * component plus its verify verdict. Selecting one applies `args` to the
 * controls, so the canvas renders exactly the state the pipeline verified.
 */
export interface WorkbenchScenario {
  id: string
  name: string
  /** the control values this scenario pins */
  args: Record<string, unknown>
  /**
   * Authored interaction script — hand-written catalogs only (a derived
   * catalog is serialized JSON, and a function cannot cross that boundary).
   * The sidebar shows a ▶ that runs it against the LIVE preview, logging each
   * step into the Actions panel.
   */
  play?: (ctx: { root: Element; step: (name: string, run: () => void | Promise<void>) => Promise<void> }) => void | Promise<void>
  /**
   * The three-state verdict: `ok` (a check ran, none failed) · `fail`
   * (a check ran and failed) · `unverified` (nothing examined — NOT a pass).
   */
  verdict: 'ok' | 'fail' | 'unverified'
}

export interface WorkbenchComponent {
  id: string
  /**
   * The component's REAL, importable name. Never a display string: it is what
   * the usage snippet writes, what the `source`/`lens` RPC looks up, and what
   * an agent imports. A configured label lives in `title`.
   */
  name: string
  /**
   * Identity key — `project/Name` in a monorepo. Present ONLY when it differs
   * from `name`. Every node-answered lookup (source, Lens) must send this, or
   * two packages exporting the same name ask the same question.
   */
  key?: string
  /** Display label from `pages.<name>.title`; falls back to `name`. */
  title?: string
  /** Sidebar group heading (components are grouped by this). */
  group: string
  /** Docs status pill, e.g. `'stable'`. */
  status?: string
  /** One-line description shown in the Docs view. */
  desc?: string
  /** Marks the sidebar entry with a NEW tag. */
  isNew?: boolean
  controls: readonly WorkbenchControl[]
  /** Derived scenarios (with verdicts) — listed under the component in the sidebar. */
  scenarios?: readonly WorkbenchScenario[]
  /**
   * Render the component for the given control values. Returns a node (or
   * nodes) — the workbench calls this inside its own reactive accessor, so a
   * plain VNode/atom is expected, not another accessor.
   */
  render: (props: Record<string, unknown>, ctx: WorkbenchRenderCtx) => VNodeChildAtom | VNodeChildAtom[]
  /**
   * Optional schema for this component's props.
   *
   * Any Standard Schema validates; control GENERATION additionally needs Zod,
   * because reading a schema's fields is not part of that contract. The Schema
   * panel states which of the two it could do rather than failing quietly.
   */
  schema?: unknown
}

export interface WorkbenchCatalog {
  components: readonly WorkbenchComponent[]
  /** Per-project addon presets; omitted fields use the shipped defaults. */
  presets?: WorkbenchPresets
}

/** A sidebar group derived from the catalog (preserves first-seen order). */
export interface CatalogGroup {
  group: string
  num: string
  items: readonly WorkbenchComponent[]
}

/** Group a catalog's components by their `group`, numbering groups `01`, `02`, … in first-seen order. */
export function groupComponents(catalog: WorkbenchCatalog): CatalogGroup[] {
  const order: string[] = []
  const byGroup = new Map<string, WorkbenchComponent[]>()
  for (const c of catalog.components) {
    if (!byGroup.has(c.group)) {
      byGroup.set(c.group, [])
      order.push(c.group)
    }
    byGroup.get(c.group)!.push(c)
  }
  return order.map((group, i) => ({
    group,
    num: String(i + 1).padStart(2, '0'),
    items: byGroup.get(group)!,
  }))
}

/** The starting control values for a component (its declared defaults). */
export function defaultValues(component: WorkbenchComponent): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const ctrl of component.controls) out[ctrl.key] = ctrl.default
  return out
}

export function componentById(catalog: WorkbenchCatalog, id: string): WorkbenchComponent | undefined {
  return catalog.components.find((c) => c.id === id)
}

/**
 * Build an Atlas-powered search over a catalog — the workbench search box is a
 * real `@pyreon/atlas` Catalog Graph, not a substring filter. Returns a
 * function mapping a query to ranked component ids (all, in order, when blank).
 */
/** A ranked search hit with the FIELD that matched — the dialog shows why. */
export interface CatalogSearchHit {
  id: string
  name: string
  score: number
  /** Why a non-name match surfaced, e.g. `option · soft`, `scenario · Long content`. */
  reason?: string
}

/**
 * FULLTEXT search over the catalog — not just names. Every component indexes
 * its name, id, group path, control keys, enum OPTIONS (the state/variant
 * axes — searching `soft` finds the component with a `variant: soft`), and
 * scenario names. Multi-token queries AND across fields; results rank
 * name-prefix > name > id > keyword, and keyword hits carry the matched
 * field as `reason` so the dialog can say why a row is there.
 */
export function buildSearchIndex(catalog: WorkbenchCatalog): (query: string) => CatalogSearchHit[] {
  interface Entry {
    text: string
    /** Higher wins when picking the visible reason. */
    weight: number
    reason?: string
  }
  const index = catalog.components.map((c) => {
    const entries: Entry[] = [
      { text: c.name.toLowerCase(), weight: 100 },
      { text: c.id.toLowerCase(), weight: 60 },
      { text: c.group.toLowerCase(), weight: 20, reason: `group · ${c.group}` },
    ]
    for (const ctrl of c.controls) {
      entries.push({ text: ctrl.key.toLowerCase(), weight: 30, reason: `control · ${ctrl.key}` })
      for (const opt of ctrl.options ?? []) {
        entries.push({ text: String(opt).toLowerCase(), weight: 40, reason: `${ctrl.key} · ${opt}` })
      }
    }
    for (const sc of c.scenarios ?? []) {
      entries.push({ text: sc.name.toLowerCase(), weight: 35, reason: `scenario · ${sc.name}` })
    }
    if (c.desc) entries.push({ text: c.desc.toLowerCase(), weight: 10, reason: 'description' })
    return { c, entries }
  })

  return (query: string): CatalogSearchHit[] => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
      return catalog.components.map((c) => ({ id: c.id, name: c.name, score: 0 }))
    }
    const hits: CatalogSearchHit[] = []
    for (const { c, entries } of index) {
      let total = 0
      let reason: string | undefined
      let reasonWeight = 0
      let ok = true
      for (const t of tokens) {
        let best: Entry | undefined
        for (const e of entries) {
          if (!e.text.includes(t)) continue
          if (!best || e.weight > best.weight) best = e
        }
        if (!best) {
          ok = false
          break
        }
        // name-PREFIX beats a mid-name substring
        total += best.weight + (best.weight === 100 && c.name.toLowerCase().startsWith(t) ? 20 : 0)
        if (best.reason && best.weight > reasonWeight) {
          reason = best.reason
          reasonWeight = best.weight
        }
      }
      if (ok) hits.push({ id: c.id, name: c.name, score: total, ...(reason ? { reason } : {}) })
    }
    return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  }
}

/**
 * The id-only view of the fulltext index — sidebar filtering + ↑↓ browse.
 * Results come back in CATALOG order, not match order: a filtered TREE must
 * keep its curated ordering (the dialog is where ranking belongs).
 */
export function buildSearch(catalog: WorkbenchCatalog): (query: string) => string[] {
  const rich = buildSearchIndex(catalog)
  const order = new Map(catalog.components.map((c, i) => [c.id, i]))
  return (query: string): string[] =>
    rich(query)
      .map((h) => h.id)
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
}
