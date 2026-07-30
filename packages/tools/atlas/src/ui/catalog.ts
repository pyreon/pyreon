/**
 * The `WorkbenchCatalog` — the data the `<Workbench>` renders. It fully
 * decouples the UI shell from WHAT it displays: a catalog is a flat list of
 * components, each carrying its control metadata + a `render(props)` function
 * that mounts the real thing. The example supplies a hand-written demo catalog;
 * the `atlas dev` CLI generates one from a project's discovered components.
 */
import type { VNodeChildAtom } from '@pyreon/core'
import { createCatalogGraph, inferControls } from '../core'
import type { PropShape } from '../core'
import type { Permissions } from '@pyreon/permissions'
import type { FakeQueryResult } from './query-states'

/** A single editable prop in the Controls panel. */
export interface WorkbenchControl {
  key: string
  label: string
  type: 'text' | 'enum' | 'bool'
  options?: readonly string[]
  default: unknown
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
export interface WorkbenchComponent {
  id: string
  name: string
  /** Sidebar group heading (components are grouped by this). */
  group: string
  /** Docs status pill, e.g. `'stable'`. */
  status?: string
  /** One-line description shown in the Docs view. */
  desc?: string
  /** Marks the sidebar entry with a NEW tag. */
  isNew?: boolean
  controls: readonly WorkbenchControl[]
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
export function buildSearch(catalog: WorkbenchCatalog): (query: string) => string[] {
  const toShapes = (c: WorkbenchComponent): PropShape[] =>
    c.controls.map((ctrl) => ({
      name: ctrl.key,
      type: ctrl.type === 'enum' ? { union: ctrl.options ?? [] } : ctrl.type === 'bool' ? 'boolean' : 'string',
    }))
  const graph = createCatalogGraph(
    catalog.components.map((c) => ({
      name: c.name,
      controls: inferControls(toShapes(c)),
      axes: [],
      reactivity: [],
      scenarios: [],
      tags: [c.group.toLowerCase()],
    })),
  )
  const allIds = catalog.components.map((c) => c.id)
  return (query: string): string[] => {
    const q = query.trim().toLowerCase()
    if (q === '') return allIds
    const names = new Set(graph.search(q).map((h) => h.component))
    return catalog.components.filter((c) => names.has(c.name) || c.id.includes(q)).map((c) => c.id)
  }
}
