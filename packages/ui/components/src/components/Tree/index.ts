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
 *       <For each={() => s.visibleNodes()} by={(v) => v.node.id}>
 *         {({ node, depth }) => (
 *           <TreeItem {...s.getItemProps(node.id, depth, !!node.children?.length)}>
 *             {node.label}
 *           </TreeItem>
 *         )}
 *       </For>
 *     </div>
 *   )}
 * </Tree>
 * ```
 *
 * IMPORTANT — render the items through a KEYED `<For>`. This doc used to
 * prescribe a reactive accessor (`{() => s.visibleNodes().map(…)}`) because
 * `getItemProps` returned eager SNAPSHOTS and that was the only way to keep the
 * ARIA live. Both halves of that were wrong, and measured in Chromium:
 *
 *  - a reactive accessor subscribes to `focused()`/`selected()`/`expanded()`, so
 *    every arrow key REMOUNTED the items and destroyed DOM focus —
 *    `document.activeElement` fell back to `<body>` and keyboard navigation
 *    died after a single press;
 *  - a bare `.map()` renders once, so it cannot react to expand/collapse at all
 *    (collapsing a node left its children in the DOM: 4 items before AND after).
 *
 * `<For by>` is the shape that does both: membership updates on expand/collapse
 * while surviving rows KEEP their DOM identity, so focus survives. Per-item
 * state rides accessor-valued props, which re-render the PROP, not the element.
 *
 * The rule: re-render the LIST only when its MEMBERSHIP changes, and use a
 * KEYED list so survivors are never re-created.
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
  .attrs({ tag: 'div', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', block: true })
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
