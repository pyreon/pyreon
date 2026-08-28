import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { createComponentContextTracker } from '../../utils/component-context'

export const noMutateStoreState: Rule = {
  meta: {
    id: 'pyreon/no-mutate-store-state',
    category: 'store',
    description:
      'Warn when calling .set() on store signals from a component or hook — use store actions instead.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    // The wrong pattern is mutating store state from a component / event
    // handler / hook. Inside the store's own setup or in tests asserting
    // reactivity, `.set()` is fine. Component-context detection naturally
    // skips both cases without a path-based heuristic.
    const ctx = createComponentContextTracker()

    /** Locals bound to a store — by DECLARATION, not by how they were named. */
    const storeBindings = new Set<string>()
    /** Names imported from `@pyreon/store` (`useCart`, `defineStore`, …). */
    const storeImports = new Set<string>()
    const pending: Array<{ name: string; span: { start: number; end: number } }> = []

    const callbacks: VisitorCallbacks = {
      ...ctx.callbacks,
      ImportDeclaration(node: any) {
        if (node?.source?.value !== '@pyreon/store') return
        for (const spec of node.specifiers ?? []) {
          if (spec.local?.type === 'Identifier') storeImports.add(String(spec.local.name))
        }
      },
      VariableDeclarator(node: any) {
        // COMPOSE with the tracker's own handler — spreading `ctx.callbacks`
        // and then declaring the same key silently REPLACES it, which broke
        // the component-depth counter for arrow-form components and made the
        // rule stop firing inside them. Object spread has no merge semantics
        // for colliding keys; the later definition simply wins.
        ctx.callbacks.VariableDeclarator?.(node)
        if (node?.id?.type !== 'Identifier') return
        const init = node.init
        if (init?.type !== 'CallExpression') return
        const callee = init.callee
        const name =
          callee?.type === 'Identifier'
            ? String(callee.name)
            : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
              ? String(callee.property.name)
              : null
        if (name === null) return
        // `const cart = useCartStore()` — a store hook by import or by the
        // `use*Store` / `defineStore` convention.
        if (storeImports.has(name) || /^use[A-Z]\w*Store$/.test(name) || name === 'defineStore') {
          storeBindings.add(String(node.id.name))
        }
      },
      CallExpression(node: any) {
        if (!ctx.isInComponentOrHook()) return
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier' || callee.property.name !== 'set') return

        // `store.field.set(v)` — member.member.set()
        const obj = callee.object
        if (!obj || obj.type !== 'MemberExpression') return
        const outerObj = obj.object
        if (!outerObj || outerObj.type !== 'Identifier') return

        pending.push({ name: String(outerObj.name), span: getSpan(node) })
      },
      'Program:exit'() {
        for (const p of pending) {
          // Binding first — the name is only a fallback. Keying on the name
          // alone meant renaming `cartStore` to `cart` silently disabled the
          // rule, and a rule you can switch off by renaming a variable is not
          // enforcing anything.
          const isStore = storeBindings.has(p.name) || p.name.toLowerCase().includes('store')
          if (!isStore) continue
          context.report({
            message: `Direct \`.set()\` on store state \`${p.name}\` — use store actions to mutate state for better traceability.`,
            span: p.span,
          })
        }
      },
    }
    return callbacks
  },
}
