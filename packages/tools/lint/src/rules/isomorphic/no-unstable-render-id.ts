import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A random value used as a DOM id / key in a file that renders on both sides.
 *
 * The server generates one value, the client generates a different one, and
 * every `id` / `htmlFor` / `aria-labelledby` pairing built from it breaks at
 * hydration — silently, because the markup is structurally identical and only
 * the attribute VALUE differs.
 *
 * `createUniqueId()` from `@pyreon/core` exists for exactly this: it produces
 * the same id on both passes.
 */

const ID_ATTRS = new Set(['id', 'for', 'htmlFor', 'aria-labelledby', 'aria-describedby', 'aria-controls'])

function isRandomCall(node: any): boolean {
  const c = node?.callee
  if (!c) return false
  if (c.type === 'MemberExpression' && c.object?.type === 'Identifier' && c.property?.type === 'Identifier') {
    const o = String(c.object.name)
    const p = String(c.property.name)
    if (o === 'Math' && p === 'random') return true
    if (o === 'crypto' && (p === 'randomUUID' || p === 'getRandomValues')) return true
    if (o === 'Date' && p === 'now') return true
  }
  return false
}

/** Any random call anywhere inside this subtree. */
function containsRandom(node: any, depth = 0): boolean {
  if (!node || typeof node !== 'object' || depth > 8) return false
  if ((node.type === 'CallExpression' || node.type === 'NewExpression') && isRandomCall(node)) return true
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const v = (node as Record<string, unknown>)[key]
    if (Array.isArray(v)) {
      for (const x of v) if (containsRandom(x, depth + 1)) return true
    } else if (v && typeof v === 'object' && containsRandom(v, depth + 1)) return true
  }
  return false
}

export const noUnstableRenderId: Rule = {
  meta: {
    id: 'pyreon/no-unstable-render-id',
    category: 'isomorphic',
    description:
      'A random value in an id / label-association attribute differs between the server render and the client render, so every pairing built from it breaks at hydration. Use `createUniqueId()`.',
    severity: 'error',
    appliesTo: ['shared', 'client'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        const name = node?.name
        const attr =
          name?.type === 'JSXIdentifier'
            ? String(name.name)
            : name?.type === 'JSXNamespacedName' && name.name?.type === 'JSXIdentifier'
              ? String(name.name.name)
              : null
        if (attr === null || !ID_ATTRS.has(attr)) return

        const v = node.value
        if (v?.type !== 'JSXExpressionContainer') return
        if (!containsRandom(v.expression)) return

        context.report({
          message: `Random value in \`${attr}\` — the server and the client generate DIFFERENT ids, so the association breaks at hydration (and the mismatch is invisible: the markup is identical, only the value differs). Use \`createUniqueId()\` from \`@pyreon/core\`, which returns the same id on both passes.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
