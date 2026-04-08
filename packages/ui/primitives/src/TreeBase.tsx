import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createUniqueId, splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

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
  /** Keyboard handler. */
  onKeyDown: (e: KeyboardEvent) => void
  /** Flat list of visible nodes for rendering. */
  visibleNodes: () => { node: TreeNode; depth: number }[]
  /** Props to spread on the tree container. */
  treeProps: () => Record<string, unknown>
  /** Get props for a tree item. */
  getItemProps: (id: string, depth: number, hasChildren: boolean) => Record<string, unknown>
}

export const TreeBase: ComponentFn<TreeBaseProps> = (props) => {
  const [own] = splitProps(props, [
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

  function onKeyDown(e: KeyboardEvent) {
    const visible = getVisibleNodes()
    const focusedId = focused()
    const idx = focusedId ? visible.findIndex((v) => v.node.id === focusedId) : -1

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(idx + 1, visible.length - 1)
      if (visible[next]) focused.set(visible[next]!.node.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(idx - 1, 0)
      if (visible[prev]) focused.set(visible[prev]!.node.id)
    } else if (e.key === 'ArrowRight' && focusedId) {
      e.preventDefault()
      const node = visible[idx]?.node
      if (node?.children?.length) {
        if (!isExpanded(focusedId)) expand(focusedId)
        else if (node.children[0]) focused.set(node.children[0].id)
      }
    } else if (e.key === 'ArrowLeft' && focusedId) {
      e.preventDefault()
      if (isExpanded(focusedId)) collapse(focusedId)
    } else if ((e.key === 'Enter' || e.key === ' ') && focusedId) {
      e.preventDefault()
      const node = visible[idx]?.node
      if (node && !node.disabled) select(focusedId)
    }
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
    treeProps: () => ({
      role: 'tree',
      'aria-multiselectable': own.multiple || undefined,
    }),
    getItemProps: (id: string, depth: number, hasChildren: boolean) => {
      const node = findNode(id, own.data)
      return {
        role: 'treeitem',
        id: `${baseId}-item-${id}`,
        'aria-level': depth + 1,
        'aria-expanded': hasChildren ? isExpanded(id) : undefined,
        'aria-selected': isSelectedFn(id),
        'aria-disabled': node?.disabled || undefined,
        tabIndex: focused() === id ? 0 : -1,
      }
    },
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: TreeState) => VNodeChild)(state)
  }
  return null
}
