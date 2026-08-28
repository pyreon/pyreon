import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isEsmFile } from '../../utils/project-deps'

/**
 * `require(...)` inside a package declared `"type": "module"`.
 *
 * There is no `require` in an ES module. In a browser the call throws
 * `ReferenceError: require is not defined` the first time that line runs; in
 * Node it throws the same way. Neither is caught by the test suite, because
 * **Bun defines `require` in ESM as a convenience** — so a bun-run vitest
 * suite executes the line happily and reports green.
 *
 * This repo has shipped it twice, and the second failure mode is the worse
 * one:
 *
 * - `@pyreon/code` lazily did `require('@codemirror/language')` inside
 *   `foldAll()`. Browser-only crash, and the only coverage was the no-view
 *   bail path that returns before reaching it.
 * - `@pyreon/zero`'s certificate reader did `require('node:crypto')` inside a
 *   `try { … } catch { return null }`. The ReferenceError was SWALLOWED by
 *   its own catch, so every dev certificate silently got the caller's 24-hour
 *   fallback expiry instead of its real 825 days — reissued daily, browser
 *   interstitial daily, manually-trusted certs quietly stopping working. A
 *   `require()` that crashes is a bug report; one inside a `catch` that
 *   degrades is a mystery.
 *
 * That is why this is a lint rule and not a test: the catalog's own entry
 * concludes that the lock has to be STATIC, because a behavioural test under
 * Bun is structurally incapable of catching it.
 *
 * Deliberately quiet on:
 * - packages without `"type": "module"`, and on `.cjs`/`.cts` files, where
 *   `require` is simply correct;
 * - `typeof require === 'function'` — that is UMD/environment DETECTION, not
 *   a call, and flagging it would break the one idiom written specifically to
 *   be safe in both module systems;
 * - a locally bound `require` (a parameter or an import), which is somebody's
 *   own function that happens to share the name.
 */
export const noRequireInEsm: Rule = {
  meta: {
    id: 'pyreon/no-require-in-esm',
    category: 'js',
    description:
      '`require()` in a `"type": "module"` package throws at runtime — and Bun defines `require` in ESM, so a bun-run test suite cannot catch it.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    // Resolved once per file, not per call site: the manifest walk is cached
    // but the answer cannot change mid-file.
    if (!isEsmFile(context.getFilePath())) return {}

    /** Depth of enclosing scopes that bind their own `require`. */
    let shadowed = 0

    const bindsRequire = (node: any): boolean => {
      const params = (node?.params ?? []) as any[]
      return params.some((p) => p?.type === 'Identifier' && String(p.name) === 'require')
    }

    const fnStack: boolean[] = []
    const enterFn = (node: any) => {
      const binds = bindsRequire(node)
      fnStack.push(binds)
      if (binds) shadowed += 1
    }
    const exitFn = () => {
      if (fnStack.pop() === true) shadowed -= 1
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: enterFn,
      'FunctionDeclaration:exit': exitFn,
      FunctionExpression: enterFn,
      'FunctionExpression:exit': exitFn,
      ArrowFunctionExpression: enterFn,
      'ArrowFunctionExpression:exit': exitFn,

      ImportDeclaration(node: any) {
        // `import { require } from '...'` — somebody else's function.
        for (const spec of (node?.specifiers ?? []) as any[]) {
          if (spec?.local?.type === 'Identifier' && String(spec.local.name) === 'require') {
            shadowed += 1
          }
        }
      },

      CallExpression(node: any) {
        if (shadowed > 0) return
        const callee = node?.callee
        if (callee?.type !== 'Identifier' || String(callee.name) !== 'require') return
        const arg = (node.arguments ?? [])[0]
        const spec =
          arg?.type === 'Literal' && typeof arg.value === 'string' ? String(arg.value) : null
        const named = spec === null ? 'the module' : `'${spec}'`
        context.report({
          message: `\`require()\` in an ESM package — this throws \`require is not defined\` at runtime. Import ${named} statically at module top, or \`await import(${spec === null ? '…' : `'${spec}'`})\` if it must stay lazy. Bun defines \`require\` in ESM, so the test suite will NOT catch this.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
