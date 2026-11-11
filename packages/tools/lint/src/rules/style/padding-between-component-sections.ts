import type { Rule, VisitorCallbacks } from '../../types'
import { onComponents } from '../../utils/component-shape'
import { createPadding, unwrapExpression } from '../../utils/padding'

/**
 * `pyreon/padding-between-component-sections` — a component body reads in three
 * sections, separated by blank lines:
 *
 * | Section       | Statements |
 * | ------------- | ---------- |
 * | **setup**     | `splitProps` / `mergeProps`, `useContext` and other `use*` hooks, `signal` / `state` / `createStore` / `useControllableState`, `computed` |
 * | **behaviour** | handlers (`const x = () => …`, function declarations), `effect` / `watch` / `renderEffect`, `onMount` / `onUnmount` / `onCleanup` / `onUpdate`, `provide` |
 * | **render**    | early-return guards (`if (…) return …`) and the final `return` |
 *
 * Handlers and effects share ONE section, in any order, on purpose. React style
 * guides put effects before handlers, but in Pyreon `effect()` runs
 * synchronously when it is created: `effect(() => sync())` placed above
 * `const sync = …` throws a temporal-dead-zone `ReferenceError`. A rule that
 * forced that order would push code toward the bug.
 *
 * A statement the rule cannot classify (`const label = props.a * 2`) joins the
 * section of the statement before it, so it is never flagged on its own. Before
 * the first classified statement there is no section yet, so a plain derived
 * value followed by the `return` is not a boundary.
 */

type Section = 'setup' | 'behaviour' | 'render'

const SETUP_CALLS = new Set([
  'splitProps',
  'mergeProps',
  'useContext',
  'signal',
  'state',
  'createStore',
  'useControllableState',
  'computed',
])

const BEHAVIOUR_CALLS = new Set([
  'effect',
  'watch',
  'renderEffect',
  'onMount',
  'onUnmount',
  'onCleanup',
  'onUpdate',
  'provide',
])

const HOOK = /^use[A-Z]/

function calleeName(expr: any): string | null {
  const n = unwrapExpression(expr)
  if (n?.type !== 'CallExpression') return null
  return n.callee?.type === 'Identifier' ? n.callee.name : null
}

function sectionOfCall(name: string | null): Section | null {
  if (name === null) return null
  if (BEHAVIOUR_CALLS.has(name)) return 'behaviour'
  if (SETUP_CALLS.has(name) || HOOK.test(name)) return 'setup'

  return null
}

/** `if (…) return …` or `if (…) { …; return … }` with no `else`. */
function isGuard(stmt: any): boolean {
  if (stmt.type !== 'IfStatement' || stmt.alternate) return false
  const c = stmt.consequent
  if (c.type === 'ReturnStatement') return true
  if (c.type === 'BlockStatement') return c.body.at(-1)?.type === 'ReturnStatement'

  return false
}

export function classifyStatement(stmt: any): Section | null {
  switch (stmt.type) {
    case 'ReturnStatement':
      return 'render'
    case 'IfStatement':
      return isGuard(stmt) ? 'render' : null
    case 'FunctionDeclaration':
      return 'behaviour'
    case 'VariableDeclaration': {
      const init = unwrapExpression(stmt.declarations[0]?.init)
      if (!init) return null
      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return 'behaviour'

      return sectionOfCall(calleeName(init))
    }
    case 'ExpressionStatement':
      return sectionOfCall(calleeName(stmt.expression))
    default:
      return null
  }
}

export const paddingBetweenComponentSections: Rule = {
  meta: {
    id: 'pyreon/padding-between-component-sections',
    category: 'style',
    description:
      'Require a blank line between the setup, behaviour and render sections of a component body.',
    severity: 'info',
    fixable: true,
    optIn: true,
    skipGenerated: true,
  },
  create(context) {
    const padding = createPadding(context)

    const callbacks: VisitorCallbacks = onComponents(({ fn }) => {
      if (fn.body?.type !== 'BlockStatement') return
      const body: any[] = fn.body.body
      let current: Section | null = null
      for (let i = 0; i < body.length; i++) {
        const section: Section | null = classifyStatement(body[i]) ?? current
        if (current !== null && section !== null && section !== current) {
          padding.requireBlankBefore(
            body[i - 1],
            body[i],
            `Add a blank line between ${current} and ${section}. Components read setup → behaviour → render.`,
          )
        }
        current = section
      }
    })

    return callbacks
  },
}
