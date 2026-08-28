import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, walkSubtree } from '../../utils/ast'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/query` rule.
 *
 * A `queryFn` ALWAYS receives `{ signal }` — TanStack creates a fresh
 * `AbortSignal` per fetch and aborts it when the query is superseded,
 * unmounted, or cancelled. Dropping that signal does not fail loudly; it
 * silently disables cancellation, so a component that unmounts mid-flight
 * keeps its request alive, and a rapidly-retyped search fires N requests
 * that all run to completion and race to write the cache.
 *
 * This is not hypothetical. `@pyreon/feature`'s generated hooks ship
 * `queryFn: () => http.getById(api, id)` — no signal, at three call sites
 * — so TanStack's cancellation has never worked for any feature-driven
 * query in the framework.
 *
 * ## Precision — why the I/O gate exists
 *
 * Forwarding a signal only matters when the body performs cancellable
 * I/O. A `queryFn` that reads a cache, resolves a constant, or does pure
 * computation has nothing to cancel, and flagging it would be noise. So
 * the rule fires ONLY when the body contains a call that is recognisably
 * a request: a bare `fetch(...)`, or a member call whose method name is
 * an HTTP verb (`api.get(...)`, `http.getById(...)`, `client.request(...)`).
 *
 * It stays silent when:
 *   - the arrow mentions `signal` ANYWHERE (destructured, `ctx.signal`,
 *     forwarded under a different local name) — a mention is proof of
 *     intent, and proving actual forwarding needs dataflow analysis
 *   - `queryFn` is not an inline arrow/function (an identifier reference
 *     or `endpoint.query()`-produced value has no visible body)
 *   - the body performs no request-shaped call
 *
 * Not auto-fixable: the correct fix depends on the client's option shape
 * (`fetch(url, { signal })` vs `api.get(url, { signal })` vs switching to
 * `endpoint.query()`), and guessing wrong would silently change which
 * argument object the signal lands in.
 */
const QUERY_HOOKS = new Set([
  'useQuery',
  'useInfiniteQuery',
  'useQueries',
  'useSuspenseQuery',
  'useSuspenseInfiniteQuery',
  'usePrefetchQuery',
  'usePrefetchInfiniteQuery',
])

/** Method names that indicate a cancellable request, not local work. */
const REQUEST_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'request',
  'fetch',
  'list',
  'getById',
  'query',
])

/**
 * Unwrap parentheses.
 *
 * oxc PRESERVES `ParenthesizedExpression`, so the idiomatic options thunk
 * `() => ({ … })` has a parenthesized body, not a bare `ObjectExpression`.
 * Missing this makes the rule silently skip the single most common shape
 * in the codebase while still passing on the plain-object form — a
 * false-negative that looks like a working rule.
 */
function unwrapParens(node: any): any {
  let current = node
  while (current?.type === 'ParenthesizedExpression') current = current.expression
  return current
}

function isFunctionNode(node: any): boolean {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  )
}

/**
 * Walk a subtree looking for the two facts the report depends on.
 *
 * A hand-rolled walk (rather than a nested visitor) because oxc's walker
 * gives callbacks per node type without a subtree scope — and this must
 * only inspect the `queryFn` body, not the whole file.
 */
function scanBody(node: any): { mentionsSignal: boolean; requestCall: any | null } {
  let mentionsSignal = false
  let requestCall: any | null = null

  walkSubtree(node, (current) => {
    // Any mention of `signal` — as an identifier, a property key, or a
    // shorthand — is treated as intent to forward.
    if (
      (current.type === 'Identifier' && current.name === 'signal') ||
      (current.type === 'Property' && current.key?.name === 'signal')
    ) {
      mentionsSignal = true
    }

    if (current.type === 'CallExpression' && !requestCall) {
      const callee = current.callee
      if (callee?.type === 'Identifier' && callee.name === 'fetch') {
        requestCall = current
      } else if (
        callee?.type === 'MemberExpression' &&
        callee.property?.type === 'Identifier' &&
        REQUEST_METHODS.has(callee.property.name)
      ) {
        requestCall = current
      }
    }
  })
  return { mentionsSignal, requestCall }
}

/** Find the `queryFn` property of an options object literal. */
function findQueryFn(objectExpression: any): any | null {
  const properties = objectExpression?.properties
  if (!Array.isArray(properties)) return null
  for (const property of properties) {
    if (property?.type !== 'Property') continue
    const key = property.key
    const name = key?.type === 'Identifier' ? key.name : key?.value
    if (name === 'queryFn') return unwrapParens(property.value)
  }
  return null
}

export const queryFnMustForwardSignal: Rule = {
  meta: {
    id: 'pyreon/query-fn-must-forward-signal',
    category: 'query',
    description:
      'A queryFn that performs a request must forward the AbortSignal it is given, or TanStack cancellation silently does nothing.',
    severity: 'warn',
    requiresDependency: '@pyreon/query',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (!isProjectDependency(context.getFilePath(), '@pyreon/query')) return {}

    const inspect = (optionsObject: any): void => {
      const queryFn = findQueryFn(optionsObject)
      if (!queryFn || !isFunctionNode(queryFn)) return

      // Scan the PARAMS as well as the body. `({ signal: abortSignal }) =>
      // api.get(url, { signal: abortSignal })` is correct code in which the
      // word `signal` appears ONLY in the parameter pattern — body-only
      // scanning reports it as a violation. (Found by migrating
      // `@pyreon/feature`, which renames the binding to avoid shadowing
      // `signal` from `@pyreon/reactivity`.)
      // `queryFn` is `any`, so annotate explicitly — otherwise `.map` on an
      // `any` yields `any` and the `.some` callback is an implicit-any error.
      const params = (queryFn.params ?? []) as unknown[]
      const paramsMentionSignal = params.some((param) => scanBody(param).mentionsSignal)
      const fromBody = scanBody(queryFn.body)
      const mentionsSignal = fromBody.mentionsSignal || paramsMentionSignal
      const { requestCall } = fromBody
      if (mentionsSignal || !requestCall) return

      context.report({
        message:
          '`queryFn` performs a request but never mentions `signal`. TanStack always passes ' +
          '`{ signal }` and aborts it on unmount / supersede — dropping it silently disables ' +
          'cancellation, so an unmounted component keeps fetching and a retyped search races ' +
          'its own stale responses. Forward it: `queryFn: ({ signal }) => api.get(url, { signal })`, ' +
          'or use `endpoint.query(...)` from @pyreon/http, which wires the signal for you.',
        span: getSpan(queryFn),
      })
    }

    // Local name → imported name, so an ALIASED import still matches.
    // `@pyreon/feature` writes `import { useQuery as _useQuery }` and calls
    // `_useQuery(...)`; a rule that only matches the literal identifier is
    // blind to the very file this one exists for. oxc visits
    // ImportDeclaration before any call site (imports lead the module), so
    // a single top-down pass is sufficient.
    const aliases = new Map<string, string>()

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        for (const specifier of node.specifiers ?? []) {
          if (specifier?.type !== 'ImportSpecifier') continue
          const imported = specifier.imported?.name ?? specifier.imported?.value
          const local = specifier.local?.name
          if (typeof imported === 'string' && typeof local === 'string' && local !== imported) {
            if (QUERY_HOOKS.has(imported)) aliases.set(local, imported)
          }
        }
      },

      CallExpression(node: any) {
        const callee = node.callee
        if (callee?.type !== 'Identifier') return
        const resolved = aliases.get(callee.name) ?? callee.name
        if (!QUERY_HOOKS.has(resolved)) return

        const firstArg = node.arguments?.[0]
        if (!firstArg) return

        // Options as a function — the idiomatic Pyreon shape — so unwrap
        // the thunk before looking for `queryFn`.
        if (isFunctionNode(firstArg)) {
          const body = unwrapParens(firstArg.body)
          if (body?.type === 'ObjectExpression') inspect(body)
          // `() => { return { ... } }` — check a direct return too.
          else if (body?.type === 'BlockStatement') {
            for (const statement of body.body ?? []) {
              if (
                statement?.type === 'ReturnStatement' &&
                unwrapParens(statement.argument)?.type === 'ObjectExpression'
              ) {
                inspect(unwrapParens(statement.argument))
              }
            }
          }
          return
        }

        const direct = unwrapParens(firstArg)
        if (direct?.type === 'ObjectExpression') inspect(direct)
      },
    }
    return callbacks
  },
}
