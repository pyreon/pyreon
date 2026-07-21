import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createUniqueId, mergeProps, splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { createTypeahead, typeaheadMatch } from './keyboard'

export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  disabled?: boolean
}

export interface TreeBaseProps {
  /** Tree data. */
  data: TreeNode[]
  /** Selected node id(s). */
  value?: string | string[]
  /** Default selected (uncontrolled). */
  defaultValue?: string | string[]
  /** Called on selection change. */
  onChange?: (value: string | string[]) => void
  /** Allow multi-select. */
  multiple?: boolean
  /** Initially expanded node ids. */
  defaultExpanded?: string[]
  /** Called when a node is expanded (useful for lazy loading). */
  onExpand?: (id: string) => void
  /** Render function. */
  children?: (state: TreeState) => VNodeChild
  [key: string]: unknown
}

export interface TreeState {
  /** Set of expanded node ids. */
  expanded: () => Set<string>
  /** Selected node id(s). */
  selected: () => string | string[]
  /** Currently focused node id. */
  focused: () => string | null
  /** Toggle a node's expanded state. */
  toggleExpand: (id: string) => void
  /** Expand a node. */
  expand: (id: string) => void
  /** Collapse a node. */
  collapse: (id: string) => void
  /** Select a node. */
  select: (id: string) => void
  /** Focus a node. */
  focus: (id: string) => void
  /** Check if a node is expanded. */
  isExpanded: (id: string) => boolean
  /** Check if a node is selected. */
  isSelected: (id: string) => boolean
  /**
   * Keyboard handler (WAI-ARIA tree pattern). ArrowUp/ArrowDown move focus
   * between visible nodes, ArrowRight expands / enters a child, ArrowLeft
   * collapses, Enter/Space selects, Home/End focus the first/last visible
   * node, `*` expands all siblings at the focused node's level, and printable
   * characters type-ahead to the next visible node whose label starts with the
   * typed buffer (buffer resets after ~500ms idle; a repeated same letter
   * cycles). Wire it on each tree item's `onKeyDown` (or the tree container).
   */
  onKeyDown: (e: KeyboardEvent) => void
  /** Flat list of visible nodes for rendering. */
  visibleNodes: () => { node: TreeNode; depth: number }[]
  /** Props to spread on the tree container. */
  treeProps: () => Record<string, unknown>
  /** Get props for a tree item. */
  getItemProps: (id: string, depth: number, hasChildren: boolean) => Record<string, unknown>
}

export const TreeBase: ComponentFn<TreeBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'data', 'value', 'defaultValue', 'onChange', 'multiple',
    'defaultExpanded', 'onExpand', 'children',
  ])

  const baseId = createUniqueId()

  const [selected, setSelected] = useControllableState<string | string[]>({
    value: () => own.value,
    defaultValue: own.defaultValue ?? (own.multiple ? [] : ''),
    onChange: own.onChange,
  })

  const expanded = signal(new Set<string>(own.defaultExpanded ?? []))
  const focused = signal<string | null>(null)
  // Per-instance typeahead buffer (WAI-ARIA tree "type-to-select").
  const typeahead = createTypeahead()

  function isExpanded(id: string): boolean { return expanded().has(id) }

  function isSelectedFn(id: string): boolean {
    const sel = selected()
    return Array.isArray(sel) ? sel.includes(id) : sel === id
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded())
    if (next.has(id)) { next.delete(id) } else { next.add(id); own.onExpand?.(id) }
    expanded.set(next)
  }

  function expand(id: string) {
    if (expanded().has(id)) return
    const next = new Set(expanded())
    next.add(id)
    expanded.set(next)
    own.onExpand?.(id)
  }

  function collapse(id: string) {
    if (!expanded().has(id)) return
    const next = new Set(expanded())
    next.delete(id)
    expanded.set(next)
  }

  function select(id: string) {
    if (own.multiple) {
      const current = Array.isArray(selected()) ? selected() as string[] : []
      const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
      setSelected(next)
    } else {
      setSelected(id)
    }
  }

  function getVisibleNodes(): { node: TreeNode; depth: number }[] {
    const result: { node: TreeNode; depth: number }[] = []
    function walk(nodes: TreeNode[], depth: number) {
      for (const node of nodes) {
        result.push({ node, depth })
        if (node.children?.length && isExpanded(node.id)) {
          walk(node.children, depth + 1)
        }
      }
    }
    walk(own.data, 0)
    return result
  }

  /**
   * Move BOTH halves of the roving tabindex: the STATE (which item carries
   * `tabIndex=0`) and real DOM FOCUS.
   *
   * `focused.set()` alone only did the first, so the browser's focus never
   * followed the arrow keys — the ring stayed on whatever the user last
   * clicked while `focused()` walked the tree invisibly, and a screen reader
   * announced nothing. WAI-ARIA roving tabindex is explicitly both halves:
   * exactly one item is tabbable AND focus is on it. (`navigateByRole`, which
   * Radio/Tabs use, does the `.focus()` for them — this tree hand-rolls its
   * navigation because it walks VISIBLE nodes across collapsed subtrees, so it
   * has to do the same thing itself.)
   *
   * Scoped to the event's container and matched by id rather than
   * `getElementById`, so a tree rendered in a detached container still works.
   */
  function moveFocusTo(e: KeyboardEvent, id: string) {
    focused.set(id)
    const container = e.currentTarget as HTMLElement | null
    if (!container) return
    const target = `${baseId}-item-${id}`
    for (const el of container.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
      if (el.id === target) {
        el.focus()
        return
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    // Editable-target bail (code-style rule: any container-level keydown that
    // owns shortcuts must not hijack typing) — the JSDoc explicitly sanctions
    // wiring this handler on the TREE CONTAINER, so an input/textarea rendered
    // inside a node (inline rename, filter box) would otherwise lose its
    // arrows/Home/End/Space and every printable char to tree navigation.
    const t = e.target as HTMLElement | null
    if (
      t &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
        t.isContentEditable)
    ) {
      return
    }

    const visible = getVisibleNodes()
    const focusedId = focused()
    const idx = focusedId ? visible.findIndex((v) => v.node.id === focusedId) : -1

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(idx + 1, visible.length - 1)
      if (visible[next]) moveFocusTo(e, visible[next]!.node.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(idx - 1, 0)
      if (visible[prev]) moveFocusTo(e, visible[prev]!.node.id)
    } else if (e.key === 'ArrowRight' && focusedId) {
      e.preventDefault()
      const node = visible[idx]?.node
      if (node?.children?.length) {
        if (!isExpanded(focusedId)) expand(focusedId)
        else if (node.children[0]) moveFocusTo(e, node.children[0].id)
      }
    } else if (e.key === 'ArrowLeft' && focusedId) {
      e.preventDefault()
      if (isExpanded(focusedId)) collapse(focusedId)
    } else if ((e.key === 'Enter' || e.key === ' ') && focusedId) {
      e.preventDefault()
      const node = visible[idx]?.node
      if (node && !node.disabled) select(focusedId)
    } else if (e.key === 'Home') {
      // WAI-ARIA tree: focus the first visible node.
      e.preventDefault()
      if (visible[0]) moveFocusTo(e, visible[0].node.id)
    } else if (e.key === 'End') {
      // WAI-ARIA tree: focus the LAST visible node (respects collapsed
      // subtrees — getVisibleNodes already excludes them).
      e.preventDefault()
      const last = visible[visible.length - 1]
      if (last) moveFocusTo(e, last.node.id)
    } else if (e.key === '*' && focusedId) {
      // WAI-ARIA tree: expand ALL sibling nodes at the focused node's level
      // (nodes sharing its parent). Only siblings with children are affected;
      // nodes further up/down the tree stay as they are.
      e.preventDefault()
      const siblings = getSiblingsOf(focusedId)
      const next = new Set(expanded())
      let changed = false
      for (const s of siblings) {
        if (s.children?.length && !next.has(s.id)) {
          next.add(s.id)
          own.onExpand?.(s.id)
          changed = true
        }
      }
      if (changed) expanded.set(next)
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // WAI-ARIA tree typeahead: printable characters move focus to the next
      // VISIBLE node whose label starts with the accumulated buffer (buffer
      // resets after ~500ms idle; a repeated same letter cycles). Space never
      // reaches here — it is consumed by the Enter/Space select branch above.
      const search = typeahead.push(e.key)
      if (search) {
        const match = typeaheadMatch(visible.map((v) => v.node.label), search, idx)
        if (match >= 0) {
          e.preventDefault()
          moveFocusTo(e, visible[match]!.node.id)
        }
      }
    }
  }

  /** Return the array of nodes that are siblings of `id` (i.e. the array that
   *  directly contains it — its parent's `children`, or the root list). */
  function getSiblingsOf(id: string): TreeNode[] {
    let result: TreeNode[] = []
    function walk(nodes: TreeNode[]): boolean {
      if (nodes.some((n) => n.id === id)) {
        result = nodes
        return true
      }
      for (const n of nodes) {
        if (n.children?.length && walk(n.children)) return true
      }
      return false
    }
    walk(own.data)
    return result
  }

  function findNode(id: string, nodes: TreeNode[]): TreeNode | undefined {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNode(id, node.children)
        if (found) return found
      }
    }
    return undefined
  }

  const state: TreeState = {
    expanded,
    selected,
    focused,
    toggleExpand,
    expand,
    collapse,
    select,
    focus: (id) => focused.set(id),
    isExpanded,
    isSelected: isSelectedFn,
    onKeyDown,
    visibleNodes: getVisibleNodes,
    // Forward the component-level props (rocketstyle className/style, data-*,
    // id…) onto the TREE CONTAINER — the element a Tree wrapper's .theme()
    // actually describes. This primitive renders no element of its own, so
    // without this the whole rocketstyle chain computes a class that reaches
    // NOTHING and the component renders UNSTYLED. mergeProps (descriptor-safe)
    // is required over object spread so a getter-shaped reactive prop is not
    // frozen; the primitive's own ARIA is passed last and therefore wins.
    treeProps: () =>
      mergeProps(rest as Record<string, unknown>, {
      role: 'tree',
      // ARIA state must be a STRING enum, never a boolean — a boolean `true`
      // that bypasses the runtime aria coercion renders as presence-only
      // `aria-multiselectable=""`, which AT reads as the default (false).
      // Mirrors ComboboxBase's listbox wiring.
      'aria-multiselectable': own.multiple ? 'true' : undefined,
      } as Record<string, unknown>),
    /**
     * ACCESSOR-VALUED, not snapshots. These used to read their signals EAGERLY
     * (`tabIndex: focused() === id ? 0 : -1`), which froze them at spread time —
     * so the only way to keep them live was to re-render the whole list inside a
     * reactive accessor (`{() => visibleNodes().map(…)}`), which is what this
     * package's docs and the showcase demo did.
     *
     * That shape REMOUNTS every item on each focus/selection change, which
     * DESTROYS DOM focus: measured in Chromium, one ArrowDown left
     * `document.activeElement === document.body`, so the next arrow key had no
     * target and keyboard navigation died after a single press.
     *
     * `applyProp` renderEffect-wraps a FUNCTION value, so an accessor stays live
     * through a plain `{...getItemProps(…)}` spread while the element itself is
     * never re-created. Render items STATICALLY.
     */
    getItemProps: (id: string, depth: number, hasChildren: boolean) => {
      const node = findNode(id, own.data)
      return {
        role: 'treeitem',
        id: `${baseId}-item-${id}`,
        'aria-level': depth + 1,
        'aria-expanded': hasChildren ? () => (isExpanded(id) ? 'true' : 'false') : undefined,
        'aria-selected': () => (isSelectedFn(id) ? 'true' : 'false'),
        'aria-disabled': node?.disabled ? 'true' : undefined,
        tabIndex: () => (focused() === id ? 0 : -1),
      }
    },
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: TreeState) => VNodeChild)(state)
  }
  return null
}
