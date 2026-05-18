import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/storage` best-practice rule.
 *
 * `useStorage` / `useSessionStorage` / `useCookie` / `useIndexedDB` /
 * `useMemoryStorage` return a `StorageSignal<T>` — a signal whose callable
 * surface is READ-ONLY (`pref()` reads the current value). Calling it with
 * an argument (`pref(next)`) does NOT write — it reads and discards the
 * argument, exactly like a bare `signal()`. Writes go through `.set(...)`
 * / `.update(...)` (and `.remove()` clears).
 *
 * Detection mirrors the proven `no-signal-call-write` shape: bindings are
 * collected in a single top-down pass (oxc visits VariableDeclaration
 * before nested function bodies, and `const` is in the TDZ before
 * declaration — so a use site never precedes its binding's visitor).
 * Scope-blind on purpose: shadowing a storage-signal name with a
 * non-signal in a nested scope is itself unusual, and the diagnostic
 * points at the exact call so a human can dismiss the rare false
 * positive.
 *
 * Conservative, zero false positives:
 *   - zero-arg `pref()` is a READ — not flagged
 *   - `pref.set(x)` / `pref.update(fn)` / `pref.remove()` are member
 *     calls (callee is a MemberExpression) — not flagged
 *   - only `const` declarations qualify (`let`/`var` may be reassigned to
 *     a non-signal, so a use-site call wouldn't be a reliable write)
 *
 * Auto-fixable: `name(arg)` → `name.set(arg)` (pure syntactic rewrite of
 * the callee identifier; the argument list is left untouched).
 *
 * Stays completely silent in projects that don't depend on
 * `@pyreon/storage` (no noise, no config).
 */
const STORAGE_FACTORIES = new Set([
  'useStorage',
  'useSessionStorage',
  'useCookie',
  'useIndexedDB',
  'useMemoryStorage',
])

export const noStorageWriteAsCall: Rule = {
  meta: {
    id: 'pyreon/no-storage-write-as-call',
    category: 'storage',
    description:
      'In @pyreon/storage projects, write to a storage signal via .set(...)/.update(...), not by calling it.',
    severity: 'error',
    fixable: true,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    if (!isProjectDependency(context.getFilePath(), '@pyreon/storage')) {
      return {}
    }

    const bindings = new Set<string>()

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        if (node.kind !== 'const') return
        for (const decl of node.declarations ?? []) {
          if (decl?.type !== 'VariableDeclarator') continue
          if (decl.id?.type !== 'Identifier') continue
          const init = decl.init
          if (!init || init.type !== 'CallExpression') continue
          const factory = init.callee
          if (!factory || factory.type !== 'Identifier') continue
          if (!STORAGE_FACTORIES.has(factory.name)) continue
          bindings.add(decl.id.name)
        }
      },
      CallExpression(node: any) {
        const callee = node.callee
        // Member calls (`pref.set(...)`, `pref.update(...)`,
        // `pref.remove()`) are the correct write/clear surface — skip.
        if (!callee || callee.type !== 'Identifier') return
        if (!bindings.has(callee.name)) return
        // Zero-arg call is a READ — the documented signal API.
        if (!node.arguments || node.arguments.length === 0) return

        const name = callee.name
        context.report({
          message:
            `Calling a storage signal ("${name}(...)") reads and discards the argument — use ${name}.set(...) (or .update(...)) to write.`,
          span: getSpan(node),
          fix: { span: getSpan(callee), replacement: `${name}.set` },
        })
      },
    }
    return callbacks
  },
}
