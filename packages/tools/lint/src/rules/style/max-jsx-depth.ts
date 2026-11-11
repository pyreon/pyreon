import type { Rule, VisitorCallbacks } from '../../types'
import { childrenOf, isComponentDefinition, onComponents } from '../../utils/component-shape'

/**
 * `pyreon/max-jsx-depth` — a component's JSX may nest at most `max` elements
 * deep (default 6; `readable-strict` uses 5). Reported ONCE per component, at
 * the deepest element, naming the subtree to extract.
 *
 * Elements inside render callbacks (`<For>{(row) => <li>…</li>}</For>`) and
 * JSX passed as a prop (`fallback={<Spinner />}`) count, because they nest on
 * the screen. A nested component DEFINITION does not: its JSX is its own.
 *
 * Why 6: in this repo the per-component depth is p50 3, p90 5, p99 7.
 * oxlint's `react/jsx-max-depth` reports once per element (28 reports for 7
 * components at depth 6) and needs the React plugin, whose correctness rules
 * flag correct Pyreon code.
 */

const DEFAULT_MAX = 6

function describeElement(el: any, source: string): string {
  if (el.type === 'JSXFragment') return '<>'
  const opening = el.openingElement
  const name = opening?.name ? source.slice(opening.name.start, opening.name.end) : 'element'
  for (const attr of opening?.attributes ?? []) {
    if (attr.type !== 'JSXAttribute') continue
    const key = attr.name?.name
    if (key !== 'class' && key !== 'className' && key !== 'id' && key !== 'data-testid') continue
    if (attr.value?.type !== 'Literal' || typeof attr.value.value !== 'string') continue
    const value = attr.value.value.length > 30 ? `${attr.value.value.slice(0, 27)}...` : attr.value.value

    return `<${name} ${key}="${value}">`
  }

  return `<${name}>`
}

export const maxJsxDepth: Rule = {
  meta: {
    id: 'pyreon/max-jsx-depth',
    category: 'style',
    description:
      'Limit how deeply a component nests JSX; past the limit, extract a subtree into its own component.',
    severity: 'info',
    fixable: false,
    optIn: true,
    skipGenerated: true,
    schema: { max: 'number' },
  },
  create(context) {
    const options = context.getOptions()
    const max = typeof options.max === 'number' ? options.max : DEFAULT_MAX
    const source = context.getSourceText()

    const callbacks: VisitorCallbacks = onComponents(({ fn }) => {
      // Deepest JSX path inside this component (not inside a nested component).
      let deepest: any[] = []
      const path: any[] = []
      const visit = (node: any): void => {
        if (node !== fn && isComponentDefinition(node)) return
        const isJsx = node.type === 'JSXElement' || node.type === 'JSXFragment'
        if (isJsx) {
          path.push(node)
          if (path.length > deepest.length) deepest = [...path]
        }
        for (const child of childrenOf(node)) visit(child)
        if (isJsx) path.pop()
      }
      visit(fn.body)

      const depth = deepest.length
      if (depth <= max) return
      // Extracting the subtree rooted at level k leaves the component at depth
      // k and gives the new component depth (depth - k + 1). The shallowest k
      // that keeps the new component within the limit names the biggest,
      // most self-contained piece.
      let k = Math.min(Math.max(2, depth - max + 1), depth)
      // A fragment has no name to point at; name the first element under it.
      while (k < depth && deepest[k - 1].type === 'JSXFragment') k++
      const root = deepest[k - 1]
      const leaf = deepest[depth - 1]
      const anchor = leaf.type === 'JSXElement' ? leaf.openingElement : leaf.openingFragment ?? leaf
      context.report({
        message: `JSX is nested ${depth} deep (max ${max}). Extract the \`${describeElement(root, source)}\` subtree into its own component. Deep trees hide structure.`,
        span: { start: anchor.start, end: anchor.end },
      })
    })

    return callbacks
  },
}
