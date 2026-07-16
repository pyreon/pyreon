import { TreeBase } from '@pyreon/ui-primitives'
import { disabledState, el } from '../../factory'

/**
 * Tree — a WAI-ARIA tree that delegates ALL behavior + accessibility to
 * `TreeBase` and adds only styling (the primitive-first rule).
 *
 * Until now this was a styled `<div>` with ZERO keyboard support and no ARIA,
 * while `TreeBase` — 281 lines of fully keyboard-tested tree behavior — sat
 * ORPHANED, imported by nothing.
 *
 * `TreeBase` is a render-fn primitive, so `<Tree>` takes a render callback and
 * hands you the tree state (the same shape as Combobox/Calendar/ColorPicker):
 *
 * ```tsx
 * <Tree data={nodes} defaultExpanded={['docs']}>
 *   {(s) => (
 *     <div {...s.treeProps()} onKeyDown={s.onKeyDown}>
 *       {() =>
 *         s.visibleNodes().map(({ node, depth }) => (
 *           <TreeItem {...s.getItemProps(node.id, depth, !!node.children?.length)}>
 *             {node.label}
 *           </TreeItem>
 *         ))
 *       }
 *     </div>
 *   )}
 * </Tree>
 * ```
 *
 * IMPORTANT — render the items inside a REACTIVE ACCESSOR (`{() => …}`), not a
 * bare `.map()`. `getItemProps` returns a SNAPSHOT: `aria-selected`,
 * `aria-expanded` and `tabIndex` are evaluated at call time. Rendering the list
 * once freezes that ARIA, so selection/expansion would never be announced to a
 * screen reader and the roving tabindex would never move. The accessor re-reads
 * `getItemProps`, subscribing it to `selected()`/`focused()`/`expanded()`.
 * (Same contract as ComboboxBase's `getOptionProps`.)
 *
 * Free from the primitive: roving tabindex, ArrowUp/Down/Left/Right, Home/End,
 * Enter/Space select, `*` expand-siblings and type-ahead — plus `role="tree"` /
 * `role="treeitem"`, `aria-expanded` / `aria-selected` / `aria-level`.
 *
 * NOTE: no `.attrs()` here, on purpose. With `component: TreeBase`, Element is
 * no longer the rendered component, so Element layout props (tag/direction/
 * block) would be forwarded through `rest` onto the consumer's container as
 * junk DOM attributes. The layout is expressed as CSS instead — the same reason
 * Combobox/Calendar/ColorPicker carry no `.attrs()`. The theme lands on the
 * element the consumer spreads `treeProps()` onto (see #2372).
 */
const Tree = el.config({ name: 'Tree', component: TreeBase }).theme((t) => ({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  fontSize: t.fontSize.small,
  color: t.color.system.base[700],
}))

export default Tree

export const TreeItem = el
  .config({ name: 'TreeItem' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true })
  .theme((t) => ({
    cursor: 'pointer',
    borderRadius: t.borderRadius.small,
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
    transition: t.transition.fast,
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    paddingLeft: t.spacing.small,
    paddingRight: t.spacing.small,
    hover: {
      backgroundColor: t.color.system.base[100],
    },
    focus: {
      backgroundColor: t.color.system.base[100],
      outline: 'none',
    },
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .states((t) => ({
    selected: {
      backgroundColor: t.color.system.primary[50],
      color: t.color.system.primary[700],
    },
  }))
