import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isTestFile } from '../../utils/file-roles'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * `pyreon/prefer-isserver` — prefer the canonical `isServer` / `isClient`
 * environment primitives from `@pyreon/reactivity` over hand-rolled
 * `typeof window` / `typeof document` checks.
 *
 * `@pyreon/reactivity` exports `isServer` (`typeof document === 'undefined'`)
 * and `isClient` (its inverse) as the single source of truth for SSR
 * detection (PR #1503). Before that, packages each rolled their own
 * `const isBrowser = typeof window !== 'undefined'` — and they DISAGREED
 * on the discriminator (`window` vs `document`), so env-detection behaviour
 * varied by package. `typeof document` ("is there a DOM") is the reliable
 * test; `typeof window` misreports environments where `window` is polyfilled
 * but there's no DOM. The primitive fixes both the drift and the semantics.
 *
 * This rule nudges toward the primitive. It is a `recommended`-level **warn**
 * (advisory, never fails the errors-only Pyreon Lint Gate) and **self-gates
 * on the project depending on `@pyreon/reactivity` / `@pyreon/core`**, so it
 * stays silent in non-Pyreon projects that legitimately use `typeof window`
 * for their own feature detection.
 *
 * Flags the env-detection idiom specifically — `typeof window`/`typeof
 * document` compared to `'undefined'` (either order, `===`/`!==`/`==`/`!=`).
 * It does NOT touch `typeof window.foo` (typeof applied to a member access,
 * i.e. genuine feature detection) — only the bare `window` / `document`
 * identifier.
 *
 * Not auto-fixable: the fix requires adding/merging an `import { isServer }
 * from '@pyreon/reactivity'` which a span-replacement can't manage safely.
 * The message names the exact primitive to use.
 *
 * The reactivity module that DEFINES the primitives is exempt (it can't
 * import them from itself).
 */
export const preferIsServer: Rule = {
  meta: {
    id: 'pyreon/prefer-isserver',
    category: 'ssr',
    description:
      "Prefer `isServer` / `isClient` from `@pyreon/reactivity` over hand-rolled `typeof window` / `typeof document` checks — they single-source SSR detection (PR #1503) and use the reliable `typeof document` discriminator. Recommended-level warn, gated on the project depending on @pyreon/reactivity.",
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()

    if (isTestFile(filePath)) return {}
    if (isPathExempt(context)) return {}

    // Self-gate: only nudge toward the Pyreon primitive in projects that
    // actually depend on it (zero noise in non-Pyreon code).
    if (
      !isProjectDependency(filePath, '@pyreon/reactivity') &&
      !isProjectDependency(filePath, '@pyreon/core')
    ) {
      return {}
    }

    // Exempt the module that DEFINES the primitives — it can't import them
    // from itself, and its `typeof document === 'undefined'` IS the canonical
    // implementation.
    if (/export\s+(?:const|let|function)\s+is(?:Server|Client)\b/.test(context.getSourceText())) {
      return {}
    }

    /**
     * Classify a `typeof window/document <op> 'undefined'` env check.
     * Returns the primitive that should replace it, or null if not a match.
     * Handles either operand order and both equality operators.
     */
    function envCheckKind(node: any): 'isServer' | 'isClient' | null {
      if (node?.type !== 'BinaryExpression') return null
      const op = node.operator
      if (op !== '===' && op !== '!==' && op !== '==' && op !== '!=') return null

      const typeofIdent = (n: any): string | null =>
        n?.type === 'UnaryExpression' &&
        n.operator === 'typeof' &&
        n.argument?.type === 'Identifier'
          ? n.argument.name
          : null
      const isUndefinedLiteral = (n: any): boolean =>
        (n?.type === 'Literal' || n?.type === 'StringLiteral') && n.value === 'undefined'

      // The typeof can be on either side (`typeof window !== 'undefined'` or the
      // yoda form `'undefined' !== typeof window`).
      let name = typeofIdent(node.left)
      let other = node.right
      if (name == null) {
        name = typeofIdent(node.right)
        other = node.left
      }
      if (name !== 'window' && name !== 'document') return null
      if (!isUndefinedLiteral(other)) return null

      // `!==` / `!=` → "X is defined" → client. `===` / `==` → "X is undefined" → server.
      const isDefinedCheck = op === '!==' || op === '!='
      return isDefinedCheck ? 'isClient' : 'isServer'
    }

    const callbacks: VisitorCallbacks = {
      BinaryExpression(node: any) {
        const kind = envCheckKind(node)
        if (!kind) return
        const span = getSpan(node)
        context.report({
          message: `Prefer \`${kind}\` from \`@pyreon/reactivity\` over a hand-rolled \`typeof window/document\` check. The canonical env primitives (\`isServer = typeof document === 'undefined'\`, \`isClient\` its inverse) single-source SSR detection and use the reliable \`typeof document\` discriminator (\`typeof window\` misreports DOM-less environments where \`window\` is polyfilled). Import \`{ ${kind} }\` from \`@pyreon/reactivity\` and use it directly.`,
          span,
        })
      },
    }

    return callbacks
  },
}
