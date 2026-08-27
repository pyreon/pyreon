import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'

/**
 * Mirrors the D1 MCP detector (`signal-write-as-call`) at lint time so
 * editors flag `sig(value)` write attempts as the user types them.
 *
 * Bindings are collected in a single top-down pass: oxc visits
 * VariableDeclaration top-down before nested function bodies, and `const`
 * is in the TDZ before declaration — so a use site never precedes its
 * binding's visitor. Scope-blind on purpose: shadowing a signal name
 * with a non-signal in a nested scope is itself unusual, and the
 * diagnostic points at the exact call so a human can dismiss the rare
 * false positive.
 *
 * Only `const` declarations qualify — `let`/`var` may be reassigned to a
 * non-signal value, so a use-site call wouldn't be a reliable
 * signal-write.
 */
export const noSignalCallWrite: Rule = {
  meta: {
    id: 'pyreon/no-signal-call-write',
    category: 'reactivity',
    description:
      'Disallow `sig(value)` write attempts on signal/computed bindings — `signal()` is the read-only callable. Use `sig.set(value)` or `sig.update(fn)`.',
    severity: 'error',
    fixable: true,
  },
  create(context) {
    const bindings = new Set<string>()

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        if (node.kind !== 'const') return
        for (const decl of node.declarations ?? []) {
          if (decl?.type !== 'VariableDeclarator') continue
          if (decl.id?.type !== 'Identifier') continue
          const init = decl.init
          if (!init) continue
          if (!isCallTo(init, 'signal') && !isCallTo(init, 'computed')) continue
          bindings.add(decl.id.name)
        }
      },
      CallExpression(node: any) {
        const callee = node.callee
        if (!callee || callee.type !== 'Identifier') return
        if (!bindings.has(callee.name)) return
        // Zero-arg call is a READ — the documented Pyreon API.
        if (!node.arguments || node.arguments.length === 0) return

        // Autofix ONLY the unambiguous shape: exactly one argument that is
        // not a function. `sig(prev => prev + 1)` reads as UPDATE intent, and
        // `.set(fn)` would store the function itself as the value — a
        // different bug, silently introduced by the fixer. Multi-arg calls
        // are equally unclear. Both are reported without a fix.
        const args = node.arguments
        const only = args.length === 1 ? args[0] : null
        const fixable =
          only !== null &&
          only.type !== 'ArrowFunctionExpression' &&
          only.type !== 'FunctionExpression' &&
          only.type !== 'SpreadElement'

        context.report({
          message:
            `\`${callee.name}(value)\` does NOT write the signal — \`signal()\` is the read-only callable surface and ignores its arguments. Use \`${callee.name}.set(value)\` or \`${callee.name}.update((prev) => …)\`.`,
          span: getSpan(node),
          ...(fixable
            ? { fix: { span: { start: callee.end, end: callee.end }, replacement: '.set' } }
            : {}),
        })
      },
    }
    return callbacks
  },
}
