/**
 * Server half of page form posts — the no-JavaScript path of `<Form>` and
 * the route-level `action` export. See `form.tsx` for the protocol.
 *
 * A POST to a PAGE URL is an action submission when it names one
 * (`?_action=<id>`, what `<Form>` renders) or when the matched route
 * exports `action` (a plain `<form method="post">`). The action runs
 * behind the SAME origin check and body limit as `/_zero/actions/*`, and
 * AFTER the app's and the route's own middleware — so an auth gate on the
 * page also gates its action. Then:
 *
 *  - enhanced (`X-Zero-Action: 1`, sent by `<Form>` under JS) → JSON;
 *  - `redirect()` → `303 See Other` (POST/Redirect/GET);
 *  - otherwise → the page is re-rendered as a GET with the result
 *    available to `useSubmission(action)`, under the result's status.
 *
 * @internal
 */
import type { RouteRecord } from '@pyreon/router'
import { safeRedirectLocation } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import { useRequestLocals } from '@pyreon/server'
import type { Action, ActionOutcome, ResolvedActionOptions } from './actions'
import { _getAction, checkActionOrigin, readActionPayload, runActionHandler } from './actions'
import type { ActionSnapshot, EnhancedActionResponse } from './form'
import { _setActionSnapshotReader, ACTION_QUERY_PARAM, ENHANCED_ACTION_HEADER } from './form'
import { warmRouteModules } from './server-islands-middleware'

/** `ctx.locals` key the generated route-middleware sets to the matched route's `action`. */
export const ROUTE_ACTION_LOCAL = 'zero:routeAction'
const SNAPSHOT_LOCAL = 'zero:actionSnapshot'

/**
 * Snapshot for a re-render request, keyed by the synthetic GET `Request`
 * this module builds. Weak: the entry dies with the request.
 */
const pendingSnapshots = new WeakMap<Request, ActionSnapshot>()

_setActionSnapshotReader(() => useRequestLocals()[SNAPSHOT_LOCAL] as ActionSnapshot | undefined)

/**
 * First in the chain: hand a re-render's action snapshot to the page via
 * `ctx.locals`, which the SSR handler provides to components.
 */
export function createActionSnapshotMiddleware(): Middleware {
  return (ctx) => {
    const snapshot = pendingSnapshots.get(ctx.req)
    if (snapshot) ctx.locals[SNAPSHOT_LOCAL] = snapshot
  }
}

export interface FormActionMiddlewareOptions {
  routes: RouteRecord[]
  /** Renders a page — the SSR handler WITHOUT any response cache in front. */
  render: (req: Request) => Promise<Response>
  options: ResolvedActionOptions
  /** zero's `base` without a trailing slash (`''` for `/`). */
  base: string
}

function isAction(value: unknown): value is Action {
  return typeof value === 'function' && typeof (value as { actionId?: unknown }).actionId === 'string'
}

function withBase(base: string, to: string): string {
  if (!base || !to.startsWith('/') || to.startsWith('//')) return to
  if (to === base || to.startsWith(`${base}/`) || to.startsWith(`${base}?`)) return to
  return `${base}${to}`
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

/** Handle action submissions POSTed to page URLs. */
export function createFormActionMiddleware(opts: FormActionMiddlewareOptions): Middleware {
  let warmed: Promise<void> | null = null
  const warmOnce = (): Promise<void> => (warmed ??= warmRouteModules(opts.routes))

  return async (ctx) => {
    if (ctx.req.method !== 'POST') return
    const pathname = ctx.url.pathname
    if (pathname.startsWith('/_zero/') || pathname.startsWith('/_pyreon/')) return

    const enhanced = ctx.req.headers.get(ENHANCED_ACTION_HEADER) === '1'
    const requestedId = ctx.url.searchParams.get(ACTION_QUERY_PARAM)

    let id: string
    if (requestedId !== null) {
      id = requestedId
    } else {
      const routeAction = ctx.locals[ROUTE_ACTION_LOCAL]
      if (routeAction === undefined) return // not an action POST — the handler answers 405
      if (!isAction(routeAction)) {
        console.error(
          `[Pyreon] The route for ${pathname} exports \`action\`, but it is not a defineAction() result. ` +
            'Wrap it: `export const action = defineAction(async (ctx) => { … })` — that is also what keeps ' +
            'its handler out of the client bundle.',
        )
        return text(500, 'Internal Server Error')
      }
      id = routeAction.actionId
    }

    let registered = _getAction(id)
    if (!registered) {
      // Route modules load lazily; an action defined in one (or in a module
      // only a route imports) registers when that module first evaluates.
      await warmOnce()
      registered = _getAction(id)
    }
    if (!registered) {
      return enhanced ? Response.json({ kind: 'error', message: 'Action not found' }, { status: 404 }) : text(404, 'Action not found')
    }

    const rejectedOrigin = checkActionOrigin(ctx.req, opts.options.corsOrigins)
    if (rejectedOrigin !== null) {
      const message = 'Server action rejected: Origin not allowed. Add it to `actions.corsOrigins` to opt in.'
      return enhanced ? Response.json({ kind: 'error', message }, { status: 403 }) : text(403, message)
    }

    const payload = await readActionPayload(ctx.req, opts.options.bodyLimit, enhanced)
    if (payload instanceof Response) return payload

    const outcome: ActionOutcome = await runActionHandler(registered.handler, ctx.req, payload)

    if (enhanced) {
      const body: EnhancedActionResponse =
        outcome.kind === 'redirect'
          ? { kind: 'redirect', to: safeRedirectLocation(outcome.to) }
          : outcome
      const status = outcome.kind === 'data' ? outcome.status : outcome.kind === 'error' ? 500 : 200
      return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
    }

    if (outcome.kind === 'redirect') {
      // 303 regardless of the redirect()'s own status: after a POST the
      // browser must follow with a GET (a 307 would re-POST the form).
      return new Response(null, {
        status: 303,
        headers: { Location: withBase(opts.base, safeRedirectLocation(outcome.to)) },
      })
    }

    const snapshot: ActionSnapshot =
      outcome.kind === 'error'
        ? { id, status: 500, error: outcome.message }
        : { id, status: outcome.status, data: outcome.data }

    const getUrl = new URL(ctx.req.url)
    getUrl.searchParams.delete(ACTION_QUERY_PARAM)
    const headers = new Headers(ctx.req.headers)
    headers.delete('content-type')
    headers.delete('content-length')
    const getReq = new Request(getUrl, { method: 'GET', headers })
    pendingSnapshots.set(getReq, snapshot)

    const page = await opts.render(getReq)
    const outHeaders = new Headers(page.headers)
    // A result page is per-submission: never cache it anywhere.
    outHeaders.set('Cache-Control', 'no-store')
    return new Response(page.body, {
      status: page.status === 200 ? snapshot.status : page.status,
      headers: outHeaders,
    })
  }
}
