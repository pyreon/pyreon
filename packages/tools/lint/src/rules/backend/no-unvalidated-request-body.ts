import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * `await req.json()` flowing straight into logic with nothing validating it.
 *
 * A request body is the least trustworthy value in the process, and the type
 * annotation on it is a comment: `await req.json() as Order` compiles, asserts
 * nothing, and hands unchecked input to whatever runs next. The failure is not
 * usually an exception — it is a row written with a missing field, or a number
 * that arrived as a string.
 *
 * `@pyreon/validate` is a direct dependency of the framework and parses in one
 * call, so the fix is a line rather than a project.
 *
 * Scope, kept deliberately tight because this fires on every handler that
 * touches a body: the rule reports only when the parsed value reaches a
 * BINDING with no validating call anywhere in the same function. A body piped
 * straight into a schema, or into anything whose name looks like validation,
 * is left alone.
 */
const BODY_READERS = new Set(['json', 'formData', 'text'])
const VALIDATORS = /^(parse|safeParse|parseAsync|validate|assert|check|decode)$/i

/** `await req.json()` / `await request.formData()` */
function isBodyRead(node: any): string | null {
  const callee = node?.callee
  if (callee?.type !== 'MemberExpression' || callee.computed === true) return null
  const prop = callee.property?.type === 'Identifier' ? String(callee.property.name) : null
  if (prop === null || !BODY_READERS.has(prop)) return null
  const obj = callee.object?.type === 'Identifier' ? String(callee.object.name) : null
  if (obj === null || !/^(req|request|ctx|context|event)$/i.test(obj)) return null
  return `${obj}.${prop}()`
}

/** Any validating call inside this function body. */
function hasValidation(node: any, depth = 0): boolean {
  if (!node || typeof node !== 'object' || depth > 10) return false
  if (node.type === 'CallExpression') {
    const c = node.callee
    if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') {
      if (VALIDATORS.test(String(c.property.name))) return true
    }
    if (c?.type === 'Identifier' && VALIDATORS.test(String(c.name))) return true
  }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue
    const v = (node as Record<string, unknown>)[k]
    if (Array.isArray(v)) {
      for (const c of v) if (hasValidation(c, depth + 1)) return true
    } else if (v && typeof v === 'object' && hasValidation(v, depth + 1)) return true
  }
  return false
}

export const noUnvalidatedRequestBody: Rule = {
  meta: {
    id: 'pyreon/no-unvalidated-request-body',
    category: 'backend',
    description:
      'A request body read into a binding with nothing validating it — the type annotation asserts nothing at runtime, and the usual failure is a bad row rather than an exception.',
    severity: 'warn',
    appliesTo: ['server'],
    fixable: false,
  },
  create(context) {
    const fnStack: any[] = []
    const enter = (node: any) => fnStack.push(node)
    const exit = () => fnStack.pop()

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,

      VariableDeclarator(node: any) {
        const init = node?.init
        // `const body = await req.json()`
        const call = init?.type === 'AwaitExpression' ? init.argument : init
        const what = isBodyRead(call)
        if (what === null) return
        const fn = fnStack[fnStack.length - 1]
        if (fn && hasValidation(fn.body)) return
        context.report({
          message: `\`${what}\` goes straight into logic with nothing validating it. A type annotation on a request body asserts nothing at runtime, and the usual result is not an exception — it is a row written with a missing field or a number that arrived as a string. Parse it with \`@pyreon/validate\` first.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
