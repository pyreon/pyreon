// Web implementation of `<Tabs>` / `<Tab>` — top-level tab navigation.

import { createUniqueId, Fragment, h } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import type { TabProps, TabsProps } from '../types/navigation'
import { Icon } from './Icon'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Tab>` — one entry of a `<Tabs>`. `<Tabs>` reads its props and children
 * directly and never mounts the `<Tab>` element itself; rendered anywhere else
 * it is a transparent wrapper around its children.
 */
export const Tab = (props: TabProps): VNode => h(Fragment, null, props.children)

/**
 * The breakpoint is `useSizeClass()`'s (600px), the same one the native
 * targets switch on, so a window that is "regular" to the hook is the one that
 * gets a rail. One static stylesheet rather than inline styles because the
 * layout change is a media query — which an inline style cannot express, and
 * which keeps the SSR markup identical to the client's.
 */
const TABS_CSS =
  '.pyreon-tabs{display:flex;flex-direction:column-reverse;min-height:0;min-width:0}' +
  '.pyreon-tabs__list{display:flex;flex-direction:row;border-top:1px solid rgba(127,127,127,.3)}' +
  '.pyreon-tabs__tab{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:2px;' +
  'padding:8px 4px;border:0;background:none;color:inherit;font:inherit;font-size:12px;cursor:pointer;opacity:.7}' +
  '.pyreon-tabs__tab[aria-selected="true"]{opacity:1;font-weight:600}' +
  '.pyreon-tabs__panels{flex:1 1 auto;min-height:0;min-width:0;overflow:auto}' +
  '@media (min-width:600px){.pyreon-tabs{flex-direction:row}' +
  '.pyreon-tabs__list{flex-direction:column;border-top:0;border-right:1px solid rgba(127,127,127,.3);min-width:80px}' +
  '.pyreon-tabs__tab{flex:0 0 auto;padding:12px 8px}}'

interface TabEntry {
  value: string
  label: unknown
  icon: string | undefined
  testId: string | undefined
  /** Normalized to an array, which a reactive accessor may return as-is. */
  content: VNodeChild[]
}

const isVNode = (v: unknown): v is VNode =>
  typeof v === 'object' && v !== null && 'type' in v && 'props' in v

/** A label/icon prop the compiler may have emitted as a reactive thunk. */
const readProp = (v: unknown): unknown => (typeof v === 'function' ? (v as () => unknown)() : v)

/**
 * The `<Tab>` children, flattened through arrays, fragments and the
 * compiler's accessor-wrapped children. Anything that is not a `<Tab>` is
 * dropped with a dev warning — a stray node in a tab bar has nowhere to go.
 */
function collectTabs(children: unknown, out: TabEntry[]): TabEntry[] {
  if (children === null || children === undefined || typeof children === 'boolean') return out
  if (typeof children === 'function') return collectTabs((children as () => unknown)(), out)
  if (Array.isArray(children)) {
    for (const c of children) collectTabs(c, out)
    return out
  }
  if (isVNode(children)) {
    if (children.type === Fragment) {
      return collectTabs(
        children.children.length > 0 ? children.children : children.props.children,
        out,
      )
    }
    if ((children.type as unknown) === Tab) {
      const p = children.props as Record<string, unknown>
      const content = children.children.length > 0 ? children.children : p.children
      out.push({
        value: String(readProp(p.value)),
        label: p.label,
        icon: typeof p.icon === 'string' ? p.icon : undefined,
        testId: typeof p['data-testid'] === 'string' ? (p['data-testid'] as string) : undefined,
        content: Array.isArray(content) ? (content as VNodeChild[]) : [content as VNodeChild],
      })
      return out
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[Pyreon] <Tabs> children must be <Tab> elements; a non-<Tab> child was ignored.')
  }
  return out
}

/**
 * `<Tabs>` — top-level tab navigation.
 *
 * Compiles to:
 * - Web (this impl): the WAI-ARIA tabs pattern — `role="tablist"` of
 *   `role="tab"` buttons (`aria-selected`, roving `tabindex`, arrow keys /
 *   Home / End with automatic activation) over `role="tabpanel"` regions. A
 *   bottom bar below 600px of viewport width, a side rail at 600px and wider.
 * - iOS (via PMTC): `PyreonTabs` → SwiftUI `TabView(selection:)`
 * - Android (via PMTC): `PyreonTabs` → Material `BottomNavigation` /
 *   `NavigationRail` by window width
 *
 * A panel mounts the first time its tab is selected and then STAYS mounted —
 * hidden, not destroyed — so switching tabs keeps each tab's state. That is
 * what SwiftUI's `TabView` and the Android runtime do, and the reason this is
 * a primitive rather than a conditional render.
 */
export const Tabs = (props: TabsProps): VNode => {
  const tabs = collectTabs(props.children, [])
  const uid = createUniqueId()
  const tabId = (i: number): string => `${uid}-tab-${i}`
  const panelId = (i: number): string => `${uid}-panel-${i}`

  // Deferred read — the compiler emits a signal-valued prop as a getter, and
  // reading it inside each binding is what keeps the selection live.
  const selected = (): string => {
    const v = props.value
    return String(typeof v === 'function' ? (v as () => string)() : v)
  }

  const select = (i: number): void => {
    const entry = tabs[i]
    if (entry === undefined || entry.value === selected()) return
    props.onChange(entry.value)
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (tabs.length === 0) return
    const current = Math.max(
      0,
      tabs.findIndex((t) => t.value === selected()),
    )
    let next: number
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % tabs.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + tabs.length) % tabs.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = tabs.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    select(next)
    const root = (e.currentTarget as HTMLElement).ownerDocument
    root.getElementById(tabId(next))?.focus()
  }

  const buttons = tabs.map((t, i) => {
    const isSelected = (): boolean => selected() === t.value
    const label = t.label
    return h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: tabId(i),
        class: 'pyreon-tabs__tab',
        'aria-controls': panelId(i),
        'aria-selected': () => (isSelected() ? 'true' : 'false'),
        tabindex: () => (isSelected() ? 0 : -1),
        'data-testid': t.testId,
        onClick: () => select(i),
      },
      t.icon !== undefined ? h(Icon, { name: t.icon }) : null,
      h('span', null, typeof label === 'function' ? () => String(readProp(label)) : String(label)),
    )
  })

  const panels = tabs.map((t, i) => {
    // Lazy, then sticky: the content mounts on the first selection and is
    // never unmounted again. The latch is a computed with `equals`, so the
    // mount accessor below re-runs exactly ONCE (false → true) — a reactive
    // boundary re-run tears down and rebuilds its subtree, which is the state
    // loss this primitive exists to prevent, so it must not re-run per switch.
    let seen = false
    const mounted = computed(
      () => {
        if (selected() === t.value) seen = true
        return seen
      },
      { equals: Object.is },
    )
    return h(
      'div',
      {
        role: 'tabpanel',
        id: panelId(i),
        'aria-labelledby': tabId(i),
        hidden: () => selected() !== t.value,
      },
      () => (mounted() ? t.content : null),
    )
  })

  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      class: props.class === undefined ? 'pyreon-tabs' : `pyreon-tabs ${props.class}`,
      style: mergePassthroughStyle({}, props.style),
    },
    h('style', null, TABS_CSS),
    h('div', { role: 'tablist', class: 'pyreon-tabs__list', onKeyDown }, ...buttons),
    h('div', { class: 'pyreon-tabs__panels' }, ...panels),
  )
}
