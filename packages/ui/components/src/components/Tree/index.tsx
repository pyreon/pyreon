/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { For, h, splitProps } from '@pyreon/core'
import {
  TreeBase,
  type TreeBaseProps,
  type TreeNode,
  type TreeState,
} from '@pyreon/ui-primitives'
import { disabledState, el } from '../../factory'

/**
 * Tree — batteries-included WAI-ARIA tree (Element-first composition, the
 * 2026-07-21 architecture decision): `<Tree data={nodes} />` renders its own
 * accessible markup out of Element atoms wired to `TreeBase`'s props-getters.
 * Behavior/ARIA come from the base (roving tabindex + real DOM focus,
 * ArrowUp/Down/Left/Right, Home/End, Enter/Space select, `*` expand-siblings,
 * type-ahead, editable-target bail, `role="tree"`/`treeitem`, string
 * aria-state); STRUCTURE from Element content-axis props (zero hand-written
 * `display` CSS); VISUALS from rocketstyle themes. The consumer render-prop
 * remains as the escape hatch. i18n: pass `aria-label` on `<Tree>` — the
 * base's `treeProps()` forwards it onto the `role="tree"` container.
 */

/** The tree container — a vertical list via Element CONTENT-axis props. */
const TreeRoot = el
  .config({ name: 'Tree' })
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'top',
    block: true,
  })
  .theme((t) => ({
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
  }))

/**
 * The render-prop ESCAPE-HATCH chain — the pre-conversion Tree. The consumer
 * renders their own container and spreads `treeProps()`, so the theme class
 * must travel through the base's rest-forwarding (rocketstyle wrapper), and
 * the container's layout genuinely cannot come from Element props (we don't
 * render it) — the `display` CSS here is the one legitimate remaining site
 * (see the element-first ratchet allowlist).
 */
const StyledTreeBase = el.config({ name: 'Tree', component: TreeBase }).theme((t) => ({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  fontSize: t.fontSize.small,
  color: t.color.system.base[700],
}))

/**
 * One tree row. Selection styling is STATIC CSS keyed on the base's
 * accessor'd `aria-selected` attribute (the Rating `data-filled` pattern) —
 * the attribute flips via a renderEffect, the element and its class never
 * re-render, so the roving-tabindex DOM focus survives every change. The
 * `.states({ selected })` dimension stays for the render-prop escape hatch
 * (consumers passing `state="selected"` per row keep working).
 */
export const TreeItem = el
  .config({ name: 'TreeItem' })
  .attrs({
    tag: 'div',
    direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    alignY: 'center',
    block: true,
  })
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
    extendCss: `
      &[aria-selected='true'] {
        background-color: ${t.color.system.primary[50]};
        color: ${t.color.system.primary[700]};
      }
    `,
  }))
  .states((t) => ({
    selected: {
      backgroundColor: t.color.system.primary[50],
      color: t.color.system.primary[700],
    },
  }))

/**
 * The expand/collapse glyph. The caret flips via a reactive TEXT child (the
 * span itself never re-renders); leaves carry `data-leaf` and dim via static
 * CSS. `aria-hidden` — the glyph is decorative; `aria-expanded` on the row
 * already announces the state.
 */
const TreeGlyph = el
  .config({ name: 'TreeGlyph' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((t) => ({
    fontSize: 10,
    marginRight: t.spacing.xxSmall,
    extendCss: `
      &[data-leaf='true'] { opacity: 0.3; }
    `,
  }))

export interface TreeProps extends TreeBaseProps {
  /** Consumer render-prop ESCAPE HATCH — overrides the built-in markup. */
  children?: (state: TreeState) => VNodeChild
}

/**
 * IMPORTANT — the built-in rows render through a KEYED `<For by={node.id}>`,
 * never a reactive accessor and never a bare `.map()`: an accessor subscribes
 * the whole list to `focused()`/`selected()`/`expanded()` so every arrow key
 * REMOUNTS the rows and drops DOM focus to `<body>` (keyboard nav dies after
 * one press); a bare `.map()` cannot react to expand/collapse at all. `<For
 * by>` updates MEMBERSHIP on expand/collapse while surviving rows keep their
 * DOM identity. Per-row state (aria-selected, aria-expanded, tabIndex, the
 * caret glyph) rides accessor-valued props/children — live with zero
 * re-render.
 */
export const Tree: ComponentFn<TreeProps> = (props) => {
  const [own, rest] = splitProps(props, ['children'])

  // Escape hatch: a consumer render-prop replaces the built-in markup. Routed
  // through the STYLED chain so the consumer's `treeProps()` container still
  // receives the Tree theme class (the pre-conversion contract).
  if (typeof own.children === 'function') {
    return h(StyledTreeBase as never, { ...rest, children: own.children }) as unknown as VNodeChild
  }

  return h(TreeBase as never, {
    ...rest,
    children: (s: TreeState) =>
      h(
        TreeRoot as never,
        { ...s.treeProps(), onKeyDown: s.onKeyDown },
        h(For as never, {
          each: () => s.visibleNodes(),
          by: (v: { node: TreeNode }) => v.node.id,
          children: ({ node, depth }: { node: TreeNode; depth: number }) => {
            const hasChildren = !!node.children?.length
            return h(
              TreeItem as never,
              {
                ...s.getItemProps(node.id, depth, hasChildren),
                // Depth indent — static per row (a node's depth is fixed).
                style: `padding-left: ${12 + depth * 20}px`,
                onClick: () => {
                  if (node.disabled) return
                  if (hasChildren) s.toggleExpand(node.id)
                  else s.select(node.id)
                },
                onFocus: () => s.focus(node.id),
              },
              h(
                TreeGlyph as never,
                { 'data-leaf': hasChildren ? undefined : 'true' },
                // Reactive text child — the caret flips in place.
                hasChildren ? () => (s.isExpanded(node.id) ? '▼' : '▶') : '•',
              ),
              node.label,
            )
          },
        }),
      ),
  }) as unknown as VNodeChild
}

export default Tree
