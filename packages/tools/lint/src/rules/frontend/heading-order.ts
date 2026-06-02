import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend accessibility rule — flags a skipped heading level.
 *
 * Screen-reader users navigate a page by its heading outline; jumping
 * from `<h1>` straight to `<h3>` (skipping `<h2>`) breaks that outline.
 * The rule walks the headings of each component in source order and
 * reports when a level increases by MORE than one from the previous
 * heading in the same scope (the axe-core "heading-order" check). Going
 * back UP (`<h3>` → `<h2>`) and repeating a level (`<h2>` → `<h2>`) are
 * both fine.
 *
 * **Function-scoped** — the "previous level" resets at every function
 * boundary, so two sibling components in one file each get their own
 * outline (no false positive when component B opens at `<h3>` after
 * component A ended at `<h1>`). Trade-off (deliberate, low-false-positive
 * by design): a heading rendered inside a nested callback (`items.map(i
 * => <h3>…</h3>)`) is its own scope and isn't compared to an outer
 * heading — a missed skip is acceptable; a false alarm is not.
 *
 * **Limitations** (the "80% case" the rule targets): only LITERAL
 * `<h1>`–`<h6>` in a single file's source order are tracked. Dynamic
 * level components (`<Heading level={n}>`), conditional rendering, and
 * cross-component document order (a layout's `<h1>` + a page's `<h3>`
 * in separate files) are out of reach for a static walker and are not
 * flagged.
 */
export const headingOrder: Rule = {
  meta: {
    id: 'pyreon/heading-order',
    category: 'frontend',
    description:
      'Flag a skipped heading level (e.g. `<h1>` followed by `<h3>`) — breaks the screen-reader outline.',
    severity: 'warn',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    // One "last heading level" frame per function scope. Base frame
    // (index 0) covers module-scope JSX. 0 = no heading seen yet.
    const stack: number[] = [0]
    const pushScope = (): void => {
      stack.push(0)
    }
    const popScope = (): void => {
      if (stack.length > 1) stack.pop()
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: pushScope,
      'FunctionDeclaration:exit': popScope,
      FunctionExpression: pushScope,
      'FunctionExpression:exit': popScope,
      ArrowFunctionExpression: pushScope,
      'ArrowFunctionExpression:exit': popScope,

      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier') return
        const m = /^h([1-6])$/.exec(name.name)
        if (!m) return
        const level = Number(m[1])

        const top = stack.length - 1
        const prev = stack[top] ?? 0
        if (prev !== 0 && level > prev + 1) {
          context.report({
            message:
              `Heading level skipped: \`<h${prev}>\` is followed by \`<h${level}>\` — ` +
              `screen-reader users navigate by a sequential outline, so a heading ` +
              `should be at most one level deeper than the previous one. Use ` +
              `\`<h${prev + 1}>\` here (or add the intermediate heading).`,
            span: getSpan(node),
          })
        }
        stack[top] = level
      },
    }
    return callbacks
  },
}
