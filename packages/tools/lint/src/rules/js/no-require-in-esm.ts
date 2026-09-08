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
 * - a locally bound `require` — a parameter, an import, or a `const require =
 *   createRequire(import.meta.url)`. The last one is not a courtesy: it is the
 *   ESCAPE HATCH this rule's own message recommends, and the one legitimate way
 *   to load a CJS-only artifact (a napi `.node` addon, a built CJS bundle) from
 *   an ES module. Flagging it made the prescribed fix unusable, which is how
 *   `vite-plugin`'s `plain-build.test.ts` — already correct, with a comment
 *   saying why — showed up as a finding.
 */
export const noRequireInEsm: Rule = {
  meta: {
    id: 'pyreon/no-require-in-esm',
    category: 'js',
    description:
      '`require()` in a `"type": "module"` package throws at runtime — and Bun defines `require` in ESM, so a bun-run test suite cannot catch it.',
    severity: 'error',
    // BOTH surfaces. A `.test.ts` in a `"type": "module"` package throws
    // `require is not defined` under real Node exactly as `src/` does, and the
    // `source` default meant no health gate ever looked: this repo was carrying
    // 47 such calls across ten test files, all green, because bun defines
    // `require` in ESM — the very reason this rule is static and not a test.
    scanTarget: ['source', 'test'],
    fixable: false,
  },
  create(context) {
    // Resolved once per file, not per call site: the manifest walk is cached
    // but the answer cannot change mid-file.
    if (!isEsmFile(context.getFilePath())) return {}

    /** How many enclosing bindings currently shadow the global `require`. */
    let shadowed = 0

    const bindsRequire = (node: any): boolean => {
      const params = (node?.params ?? []) as any[]
      return params.some((p) => p?.type === 'Identifier' && String(p.name) === 'require')
    }

    // One entry per open function frame, counting the `require` bindings that
    // frame OWNS — its parameter, plus any `const require = …` declared inside
    // it. Exiting the frame releases exactly those. A binding declared at
    // MODULE scope is owned by no frame and is never released, which is
    // correct: it shadows for the rest of the file.
    const fnStack: number[] = []
    const enterFn = (node: any) => {
      const binds = bindsRequire(node)
      fnStack.push(binds ? 1 : 0)
      if (binds) shadowed += 1
    }
    const exitFn = () => {
      shadowed -= fnStack.pop() ?? 0
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: enterFn,
      'FunctionDeclaration:exit': exitFn,
      FunctionExpression: enterFn,
      'FunctionExpression:exit': exitFn,
      ArrowFunctionExpression: enterFn,
      'ArrowFunctionExpression:exit': exitFn,

      VariableDeclarator(node: any) {
        // `const require = createRequire(import.meta.url)` — the documented
        // escape hatch. Counted like a parameter binding so it is released when
        // its enclosing function exits; at module scope it holds for the file.
        if (node?.id?.type !== 'Identifier' || String(node.id.name) !== 'require') return
        shadowed += 1
        const top = fnStack.length - 1
        if (top >= 0) fnStack[top] = (fnStack[top] ?? 0) + 1
      },

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
