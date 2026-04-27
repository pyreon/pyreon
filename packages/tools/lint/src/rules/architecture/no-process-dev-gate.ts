import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isTestFile } from '../../utils/file-roles'

/**
 * `pyreon/no-process-dev-gate` — flag bundler-coupled dev-gate patterns
 * that are dead code or unsupported in some bundlers Pyreon ships to.
 *
 * Pyreon publishes libraries to npm. Consumers compile those libraries
 * with whatever bundler they use — Vite, Webpack (Next.js), Rolldown,
 * esbuild, Rollup, Parcel, Bun. The framework should not ship dev gates
 * that only fire in one bundler.
 *
 * **Two broken patterns this rule catches:**
 *
 * 1. `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
 *    The `typeof process` guard isn't replaced by Vite, evaluates to
 *    `false` in the browser, and the whole expression is dead. Wrapped
 *    dev warnings never fire for users running Vite browser builds.
 *
 * 2. `import.meta.env.DEV` (and the `(import.meta as ViteMeta).env?.DEV`
 *    cast variant). Vite/Rolldown literal-replace this at build time, but
 *    Webpack/esbuild/Rollup/Parcel/Bun/Node-direct don't. In a Pyreon
 *    library shipped to a Next.js (Webpack) app, dev warnings never fire
 *    — even in development. PR #200 introduced this pattern as the
 *    "correct" replacement for the typeof-process compound; that
 *    direction was wrong for library code.
 *
 * **The bundler-agnostic standard** (used by React, Vue, Preact, Solid,
 * MobX, Redux):
 *
 * ```ts
 * if (process.env.NODE_ENV !== 'production') console.warn('...')
 * ```
 *
 * Every modern bundler auto-replaces `process.env.NODE_ENV` at consumer
 * build time. No `typeof process` guard needed — bundlers replace the
 * literal regardless of whether `process` is otherwise defined.
 *
 * Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`.
 *
 * **Auto-fix**: replaces the broken expression with
 * `process.env.NODE_ENV !== 'production'`.
 *
 * **Server-only exemption**: projects configure `exemptPaths` per-file
 * for server-only code (Node environments where the typeof-process
 * compound is harmless). Configure in `.pyreonlintrc.json`:
 *
 *     {
 *       "rules": {
 *         "pyreon/no-process-dev-gate": [
 *           "error",
 *           { "exemptPaths": ["packages/zero/", "packages/core/server/"] }
 *         ]
 *       }
 *     }
 */

export const noProcessDevGate: Rule = {
  meta: {
    id: 'pyreon/no-process-dev-gate',
    category: 'architecture',
    description:
      'Forbid bundler-coupled dev gates: `typeof process !== "undefined" && process.env.NODE_ENV !== "production"` is dead in Vite browser bundles, and `import.meta.env.DEV` is Vite/Rolldown-only (dead in Webpack/Next.js, esbuild, Rollup, Parcel, Bun). Use bundler-agnostic `process.env.NODE_ENV !== "production"` — every modern bundler auto-replaces it at consumer build time.',
    severity: 'error',
    fixable: true,
  },
  create(context) {
    // Skip test files — vitest has both `process` and Vite's `import.meta.env`,
    // both broken patterns work there, and tests aren't shipped to users.
    if (isTestFile(context.getFilePath())) return {}

    // Configurable `exemptPaths` option for server-only directories.
    if (isPathExempt(context)) return {}

    const REPLACEMENT = `process.env.NODE_ENV !== 'production'`

    /**
     * Pattern 1: `typeof process !== 'undefined'`
     */
    function isTypeofProcessCheck(node: any): boolean {
      if (node?.type !== 'BinaryExpression') return false
      if (node.operator !== '!==' && node.operator !== '!=') return false
      const left = node.left
      const right = node.right
      if (left?.type !== 'UnaryExpression' || left.operator !== 'typeof') return false
      if (left.argument?.type !== 'Identifier' || left.argument.name !== 'process') return false
      return (
        (right?.type === 'Literal' || right?.type === 'StringLiteral') &&
        right.value === 'undefined'
      )
    }

    /**
     * Pattern 1: `process.env.NODE_ENV !== 'production'` — also matches
     * optional-chaining variants (`process?.env?.NODE_ENV`,
     * `process.env?.NODE_ENV`). ESTree wraps optional access in a
     * `ChainExpression` whose `.expression` is the underlying
     * `MemberExpression` chain.
     */
    function isNodeEnvCheck(node: any): boolean {
      if (node?.type !== 'BinaryExpression') return false
      if (node.operator !== '!==' && node.operator !== '!=') return false
      let left = node.left
      const right = node.right
      if (left?.type === 'ChainExpression') left = left.expression
      if (left?.type !== 'MemberExpression') return false
      if (left.object?.type !== 'MemberExpression') return false
      if (left.object.object?.type !== 'Identifier' || left.object.object.name !== 'process') {
        return false
      }
      if (left.object.property?.type !== 'Identifier' || left.object.property.name !== 'env') {
        return false
      }
      if (left.property?.type !== 'Identifier' || left.property.name !== 'NODE_ENV') return false
      return (
        (right?.type === 'Literal' || right?.type === 'StringLiteral') &&
        right.value === 'production'
      )
    }

    /**
     * Match the typeof-process compound: a `LogicalExpression` whose
     * sides are a typeof-process check + a NODE_ENV check, in either
     * order, joined with `&&`.
     */
    function isTypeofCompound(node: any): boolean {
      if (node?.type !== 'LogicalExpression') return false
      if (node.operator !== '&&') return false
      return (
        (isTypeofProcessCheck(node.left) && isNodeEnvCheck(node.right)) ||
        (isNodeEnvCheck(node.left) && isTypeofProcessCheck(node.right))
      )
    }

    /**
     * Strip layers an `import.meta.env.DEV` access can hide behind:
     * - `ChainExpression` (optional chaining)
     * - `TSAsExpression` / `TSTypeAssertion` (`(import.meta as ViteMeta)`)
     * - `ParenthesizedExpression` (just parens)
     */
    function unwrap(node: any): any {
      let n = node
      while (n) {
        if (n.type === 'ChainExpression') n = n.expression
        else if (n.type === 'TSAsExpression' || n.type === 'TSTypeAssertion') n = n.expression
        else if (n.type === 'ParenthesizedExpression') n = n.expression
        else break
      }
      return n
    }

    function isImportMeta(node: any): boolean {
      const n = unwrap(node)
      if (n?.type !== 'MetaProperty') return false
      const meta = n.meta
      const prop = n.property
      return (
        meta?.type === 'Identifier' &&
        meta.name === 'import' &&
        prop?.type === 'Identifier' &&
        prop.name === 'meta'
      )
    }

    /**
     * Pattern 2: `import.meta.env.DEV` access (any optional/cast variant).
     * Returns the outermost expression node so the autofix replaces the
     * full `import.meta.env.DEV` access (not just the `.DEV` property).
     */
    function isImportMetaEnvDev(node: any): boolean {
      const outer = unwrap(node)
      if (outer?.type !== 'MemberExpression') return false
      if (outer.property?.type !== 'Identifier' || outer.property.name !== 'DEV') return false
      // outer.object should resolve to `import.meta.env` (an inner MemberExpression
      // whose object is `import.meta` and property is `env`).
      const envAccess = unwrap(outer.object)
      if (envAccess?.type !== 'MemberExpression') return false
      if (envAccess.property?.type !== 'Identifier' || envAccess.property.name !== 'env') {
        return false
      }
      return isImportMeta(envAccess.object)
    }

    // Track ChainExpression-wrapped MemberExpressions so the inner visitor
    // doesn't double-flag the same access.
    const handledNodes = new WeakSet<object>()

    const callbacks: VisitorCallbacks = {
      LogicalExpression(node: any) {
        if (!isTypeofCompound(node)) return
        const span = getSpan(node)
        context.report({
          message:
            '`typeof process !== "undefined" && process.env.NODE_ENV !== "production"` is dead code in real Vite browser bundles — Vite does not polyfill `process`, so the guard is `false` and any wrapped dev warnings never fire. Use the bundler-agnostic `process.env.NODE_ENV !== "production"` (no typeof guard) — every modern bundler replaces it at consumer build time. Reference: `packages/fundamentals/flow/src/layout.ts`.',
          span,
          fix: { span, replacement: REPLACEMENT },
        })
      },
      ChainExpression(node: any) {
        // Catch `import.meta.env?.DEV` shapes wrapped in ChainExpression at
        // the outermost layer (e.g. when the optional `?.` is on the
        // outermost `.DEV` access). The inner MemberExpression is then
        // marked handled so the MemberExpression visitor skips it.
        if (!isImportMetaEnvDev(node)) return
        const inner = unwrap(node)
        if (inner) handledNodes.add(inner)
        const span = getSpan(node)
        context.report({
          message:
            '`import.meta.env.DEV` is Vite/Rolldown-specific. In a Pyreon library shipped to consumers using Webpack (Next.js), esbuild, Rollup, Parcel, or Bun, `import.meta.env.DEV` is undefined and dev warnings never fire — even in development. Use bundler-agnostic `process.env.NODE_ENV !== "production"` instead. Reference: `packages/fundamentals/flow/src/layout.ts`.',
          span,
          fix: { span, replacement: REPLACEMENT },
        })
      },
      MemberExpression(node: any) {
        if (handledNodes.has(node)) return
        if (!isImportMetaEnvDev(node)) return
        // Only flag the OUTERMOST `.DEV` access — the visitor will also
        // hit the inner `.env` MemberExpression, which we want to skip.
        if (node.property?.name !== 'DEV') return
        const span = getSpan(node)
        context.report({
          message:
            '`import.meta.env.DEV` is Vite/Rolldown-specific. In a Pyreon library shipped to consumers using Webpack (Next.js), esbuild, Rollup, Parcel, or Bun, `import.meta.env.DEV` is undefined and dev warnings never fire — even in development. Use bundler-agnostic `process.env.NODE_ENV !== "production"` instead. Reference: `packages/fundamentals/flow/src/layout.ts`.',
          span,
          fix: { span, replacement: REPLACEMENT },
        })
      },
    }

    return callbacks
  },
}
