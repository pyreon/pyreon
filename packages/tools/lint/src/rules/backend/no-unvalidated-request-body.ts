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
const REQUESTISH = /^(req|request|ctx|context|event)$/i

/**
 * Strip the type-only layers a body read is almost always wrapped in.
 *
 * `(await ctx.request.json()) as Order` is the single most common spelling of
 * this defect, because the cast is exactly what makes it FEEL validated. An
 * earlier version of this rule matched only the bare `await req.json()` and
 * was therefore inert against every real handler in this repo — the fixture
 * passed and the real file reported nothing.
 */
function unwrapTypeLayers(node: any): any {
  let n = node
  while (
    n &&
    (n.type === 'TSAsExpression' ||
      n.type === 'TSSatisfiesExpression' ||
      n.type === 'TSNonNullExpression' ||
      n.type === 'TSTypeAssertion' ||
      n.type === 'ParenthesizedExpression')
  ) {
    n = n.expression
  }
  return n
}

/** The receiver's readable name, if it is request-ish — `req`, `ctx.request`. */
function requestReceiver(obj: any): string | null {
  if (obj?.type === 'Identifier') {
    return REQUESTISH.test(String(obj.name)) ? String(obj.name) : null
  }
  // `ctx.request` / `event.request` — the shape zero's own ApiContext uses.
  if (obj?.type === 'MemberExpression' && obj.computed !== true) {
    const prop = obj.property?.type === 'Identifier' ? String(obj.property.name) : null
    const base = obj.object?.type === 'Identifier' ? String(obj.object.name) : null
    if (prop !== null && base !== null && REQUESTISH.test(prop)) return `${base}.${prop}`
    if (prop !== null && base !== null && REQUESTISH.test(base)) return `${base}.${prop}`
  }
  return null
}

/** `await req.json()` / `await ctx.request.formData()` */
function isBodyRead(node: any): string | null {
  const callee = unwrapTypeLayers(node)?.callee
  if (callee?.type !== 'MemberExpression' || callee.computed === true) return null
  const prop = callee.property?.type === 'Identifier' ? String(callee.property.name) : null
  if (prop === null || !BODY_READERS.has(prop)) return null
  const recv = requestReceiver(callee.object)
  if (recv === null) return null
  return `${recv}.${prop}()`
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
        // `const body = (await ctx.request.json()) as Order` — the cast may
        // sit on either side of the await, so unwrap before AND after.
        const init = unwrapTypeLayers(node?.init)
        const call = init?.type === 'AwaitExpression' ? unwrapTypeLayers(init.argument) : init
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
