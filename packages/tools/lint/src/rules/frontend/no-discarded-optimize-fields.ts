import type { Rule, VisitorCallbacks } from '../../types'
import { getJSXAttribute, getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated frontend best-practice rule.
 *
 * A `?optimize` import (`import hero from './hero.jpg?optimize'`) resolves
 * to a descriptor carrying `src` / `srcset` / `width` / `height` /
 * `placeholder` / `formats`. Pulling JUST `.src` onto a raw `<img>`
 * (`<img src={hero.src} />`) discards everything else — no intrinsic
 * dimensions (→ Cumulative Layout Shift), no responsive `srcset`, no
 * `<picture>` formats, no blur placeholder. This is the single most
 * common real-world CLS cause in @pyreon/zero apps (a real Lighthouse
 * finding on a production site).
 *
 * The fix is to render the WHOLE descriptor:
 *   `<OptimizedImage source={hero} alt="…" />`  — one prop, nothing dropped
 *   `<Image {...hero} alt="…" />`               — spread form
 *
 * Stays silent in projects that don't depend on `@pyreon/zero`. Fires
 * only on a lowercase `<img>` whose `src` is `<optimizeImport>.src` — an
 * `<Image>` / `<OptimizedImage>` is never flagged, and a `<img>` that
 * spreads the descriptor or uses a different `src` shape is left alone.
 */
export const noDiscardedOptimizeFields: Rule = {
  meta: {
    id: 'pyreon/no-discarded-optimize-fields',
    category: 'frontend',
    description:
      'Flag a raw `<img src={x.src}>` that discards the rest of a `?optimize` descriptor (CLS + missing responsive images).',
    severity: 'warn',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    // Dependency gate: only active in projects that declare `@pyreon/zero`
    // (the package that introduces the `?optimize` import query).
    if (!isProjectDependency(context.getFilePath(), '@pyreon/zero')) {
      return {}
    }

    // Default-import bindings whose source carries the `?optimize` query.
    // Imports are top-level statements, visited before any JSX in a
    // function body (top-down pre-order walk), so this is populated by
    // the time the JSX callback runs.
    const optimizeBindings = new Set<string>()

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value
        if (typeof source !== 'string' || !source.includes('?optimize')) return
        for (const spec of node.specifiers ?? []) {
          if (spec.type === 'ImportDefaultSpecifier' && spec.local?.type === 'Identifier') {
            optimizeBindings.add(spec.local.name)
          }
        }
      },

      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'img') return

        const srcAttr = getJSXAttribute(node, 'src')
        if (!srcAttr) return

        // Only `src={expr}` — a string-literal src isn't a descriptor read.
        const value = srcAttr.value
        if (!value || value.type !== 'JSXExpressionContainer') return

        // Only `IDENT.src` (non-computed member access on a bare binding).
        const expr = value.expression
        if (
          !expr ||
          expr.type !== 'MemberExpression' ||
          expr.computed ||
          expr.object?.type !== 'Identifier' ||
          expr.property?.type !== 'Identifier' ||
          expr.property.name !== 'src'
        ) {
          return
        }

        const binding = expr.object.name
        if (!optimizeBindings.has(binding)) return

        context.report({
          message:
            `\`<img src={${binding}.src}>\` discards the rest of the \`?optimize\` descriptor ` +
            `(width / height / srcset / placeholder / formats) — the #1 cause of CLS and ` +
            `missing responsive images. Render the whole descriptor instead: ` +
            `\`<OptimizedImage source={${binding}} alt="…" />\` or \`<Image {...${binding}} alt="…" />\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
