/**
 * Plain `<div>`, `<p>` and `<span>` inside a native Flow renderer, lowered only
 * where the native layout provably matches the browser's.
 *
 * A DOM element's layout comes from CSS, and most of it has no native
 * equivalent: a `class` resolves against a stylesheet the compiler never sees,
 * and flex, grid, inline flow and margins collapse differently. Guessing would
 * draw a node that looks plausible and is wrong, which is worse than the
 * warning pointing at `<FlowWebView>`. So this lowers exactly two shapes and
 * leaves everything else to the warning:
 *
 * - an element whose content is only text (static or interpolated) is a
 *   `<Text>`: one run of text reads the same in any box;
 * - a `<div>` or `<p>` whose children are all block-level (another `<div>` or
 *   `<p>`, or a `Stack` / `Inline` / `Layer`, which render block boxes on the
 *   web), or which has exactly one child of any kind, is a `<Stack>` aligned to
 *   the start with no gap: block boxes stack top to bottom, flush left.
 *
 * Any attribute other than a test id or an accessible label (a `class`, a
 * `style`, an event handler) disqualifies the element, since each of them can
 * change the layout or behaviour in ways the two shapes above do not cover.
 *
 * Shared by both emitters so iOS and Android lower the same set.
 */
import type { ExprIR } from './types'

type JsxElement = Extract<ExprIR, { kind: 'jsx-element' }>

const LOWERABLE = new Set(['div', 'p', 'span'])
const BLOCK_CHILDREN = new Set(['div', 'p', 'Stack', 'Inline', 'Layer'])
const NEUTRAL_ATTRS = new Set(['data-testid', 'aria-label', 'key'])

export function lowerFlowPlainElement(e: JsxElement): JsxElement | undefined {
  if (!LOWERABLE.has(e.tag)) return undefined
  if (!e.attrs.every((a) => a.kind === 'attr' && NEUTRAL_ATTRS.has(a.name))) return undefined
  const children = e.children.filter((c) => !(c.kind === 'text' && c.value.trim() === ''))
  const isElement = (c: (typeof children)[number]) => c.kind === 'expr' && c.expr.kind === 'jsx-element'
  if (children.length > 0 && children.every((c) => !isElement(c) && !(c.kind === 'expr' && c.expr.kind === 'jsx-fragment'))) {
    return { ...e, tag: 'Text' }
  }
  if (e.tag === 'span') return undefined
  const elements = children.filter(isElement).map((c) => (c as { expr: JsxElement }).expr)
  if (elements.length !== children.length) return undefined
  if (elements.length > 1 && !elements.every((c) => BLOCK_CHILDREN.has(c.tag))) return undefined
  return {
    ...e,
    tag: 'Stack',
    attrs: [
      ...e.attrs,
      { kind: 'attr', name: 'align', value: { kind: 'literal', value: 'start' } },
      { kind: 'attr', name: 'gap', value: { kind: 'literal', value: 0 } },
    ],
    children,
  }
}
