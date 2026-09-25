/**
 * `<Form>` + `useSubmission()` — progressive-enhancement forms over
 * server actions (`defineAction` from `@pyreon/zero/actions`).
 *
 * The contract, in both directions:
 *
 *  - **No JavaScript.** `<Form>` renders a real `<form method="post">`
 *    whose `action` is the query-only URL `?_action=<id>`. A query-only
 *    URL resolves against the CURRENT document, so the POST goes to the
 *    page itself — base path and i18n prefix included, with nothing to
 *    compute on the server or the client (and therefore no hydration
 *    mismatch). The server runs the action, then either answers `303 See
 *    Other` for a `redirect()` (POST/Redirect/GET) or re-renders the page
 *    with the result available to `useSubmission(action).result()`.
 *  - **JavaScript.** The submit is intercepted and sent with `fetch` to the
 *    same URL; the server answers JSON instead of HTML. `useSubmission`
 *    exposes `pending` / `input` (the optimistic FormData) while it runs,
 *    then `result` / `error` / `status`; on success the current route's
 *    loaders re-run in place (`router.revalidate()`), or a `redirect()`
 *    navigates client-side.
 *
 * The action URL keeps the page's own query (`/posts?page=2` posts to
 * `/posts?page=2&_action=…`), so loaders see it on the POST and re-render.
 */
import type { Props, VNodeChild } from '@pyreon/core'
import { h, mergeProps, splitProps } from '@pyreon/core'
import { batch, isServer, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { useRouter } from '@pyreon/router'
import type { Action, ActionData } from './actions'

/** Query parameter that names the action a page form post targets. @internal */
export const ACTION_QUERY_PARAM = '_action'

/** Request header marking an enhanced (fetch) submission. @internal */
export const ENHANCED_ACTION_HEADER = 'X-Zero-Action'

/** What the server hands a page about the action that produced it. @internal */
export interface ActionSnapshot {
  id: string
  status: number
  data?: unknown
  error?: string
}

/** JSON body of an enhanced submission's response. @internal */
export type EnhancedActionResponse =
  | { kind: 'data'; status: number; data: unknown }
  | { kind: 'redirect'; to: string }
  | { kind: 'error'; message: string }

// ─── Server seam ────────────────────────────────────────────────────────────
//
// On the server the snapshot lives in the per-request `locals` the SSR
// handler provides. Reading them needs `@pyreon/server`, whose barrel is not
// client-safe, so the server module registers a reader here at load time
// (the `_setLocaleStoreReader` shape). Nothing registered → no snapshot.

let serverSnapshotReader: (() => ActionSnapshot | undefined) | null = null

/** @internal Called by `@pyreon/zero/server` at module load. */
export function _setActionSnapshotReader(reader: () => ActionSnapshot | undefined): void {
  serverSnapshotReader = reader
}

// ─── Submission state ───────────────────────────────────────────────────────

/** Options for a submission. */
export interface SubmitOptions {
  /**
   * What to refresh after a SUCCESSFUL submission (status < 400, no
   * redirect):
   *  - `true` (default) — re-run the current route's loaders in place;
   *  - `false` — nothing;
   *  - a list of loader cache keys (`loaderKey` values) — invalidate only
   *    those entries; they re-run on the next navigation that needs them,
   *    and the current page is left as is.
   */
  revalidate?: boolean | readonly string[]
}

/** Reactive state of one action's submissions. */
export interface Submission<T> {
  /** `true` while a submission is in flight. */
  pending: () => boolean
  /**
   * The FormData being submitted, while `pending()` — render it
   * optimistically. `undefined` otherwise.
   */
  input: () => FormData | undefined
  /** The last settled result: the handler's return value, or a `fail()`'s data. */
  result: () => ActionData<T> | undefined
  /** HTTP status of the last settled submission (`fail()` → its status). */
  status: () => number | undefined
  /** Message of the last unexpected error (a thrown, non-redirect error). */
  error: () => string | undefined
  /**
   * Submit programmatically — the same request `<Form>` sends. Resolves
   * when the submission settled (and, on success, after revalidation).
   */
  submit: (data: FormData | Record<string, string | Blob>, options?: SubmitOptions & { url?: string }) => Promise<void>
  /** Clear `result`, `status` and `error`. */
  reset: () => void
}

interface SubmissionCell {
  pending: Signal<boolean>
  input: Signal<FormData | undefined>
  result: Signal<unknown>
  status: Signal<number | undefined>
  error: Signal<string | undefined>
  /** Version counter: a slower, older submission must not clobber a newer one. */
  version: number
}

/**
 * Client-side cells, one per action id — shared by every `<Form>` and
 * `useSubmission` of the same action. Bounded by the number of
 * `defineAction` call sites (ids are build-time constants). NEVER used on
 * the server, where state is per request.
 */
const clientCells = new Map<string, SubmissionCell>()

/** Drop every client submission state. Test isolation. @internal */
export function _resetSubmissions(): void {
  clientCells.clear()
}

function readHydratedSnapshot(id: string): ActionSnapshot | undefined {
  if (isServer) return undefined
  const el = document.querySelector(`template[data-zero-action-result="${CSS.escape(id)}"]`)
  const raw = el?.getAttribute('data-value')
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as ActionSnapshot
  } catch {
    return undefined
  }
}

function makeCell(snapshot: ActionSnapshot | undefined): SubmissionCell {
  return {
    pending: signal(false),
    input: signal<FormData | undefined>(undefined),
    result: signal<unknown>(snapshot?.data),
    status: signal<number | undefined>(snapshot?.status),
    error: signal<string | undefined>(snapshot?.error),
    version: 0,
  }
}

function cellFor(id: string): SubmissionCell {
  if (isServer) {
    const snap = serverSnapshotReader?.()
    return makeCell(snap?.id === id ? snap : undefined)
  }
  let cell = clientCells.get(id)
  if (!cell) {
    cell = makeCell(readHydratedSnapshot(id))
    clientCells.set(id, cell)
  }
  return cell
}

/**
 * The query-only form `action` for `id`, KEEPING the page's own query:
 * `search` `?page=2` → `?page=2&_action=<id>`. Works on the RAW search
 * string (no decode/re-encode), dropping only a previous `_action` pair, so
 * the server and the client — each passing its router's current path —
 * produce the identical attribute string, and loaders on the POST and its
 * re-render see the original query.
 *
 * @internal
 */
export function formActionSearch(id: string, pathOrSearch: string): string {
  const hashAt = pathOrSearch.indexOf('#')
  const noHash = hashAt === -1 ? pathOrSearch : pathOrSearch.slice(0, hashAt)
  const q = noHash.indexOf('?')
  const own =
    q === -1
      ? []
      : noHash
          .slice(q + 1)
          .split('&')
          .filter((pair) => pair !== '' && pair.split('=')[0] !== ACTION_QUERY_PARAM)
  own.push(`${ACTION_QUERY_PARAM}=${encodeURIComponent(id)}`)
  return `?${own.join('&')}`
}

function actionUrl(id: string, explicit: string | undefined): string {
  if (explicit) return explicit
  const url = new URL(globalThis.location.href)
  url.search = formActionSearch(id, url.search)
  url.hash = ''
  return url.href
}

function toFormData(data: FormData | Record<string, string | Blob>): FormData {
  if (data instanceof FormData) return data
  const fd = new FormData()
  for (const [k, v] of Object.entries(data)) fd.append(k, v)
  return fd
}

/**
 * Reactive submission state for an action — `pending`, the optimistic
 * `input`, and the settled `result` / `status` / `error`. Every call for the
 * same action shares one state on the client, so a `<Form>` in one
 * component and a spinner in another agree. After a no-JS form post the
 * server-rendered result is picked up on hydration.
 *
 * @example
 * import { defineAction, fail, Form, useSubmission } from '@pyreon/zero/actions'
 *
 * export const action = defineAction(async ({ formData }) => {
 *   const title = String(formData?.get('title') ?? '')
 *   if (!title) return fail(422, { error: 'Title is required' })
 *   await db.posts.insert({ title })
 *   return { created: title }
 * })
 *
 * export default function NewPost() {
 *   const sub = useSubmission(action)
 *   return (
 *     <Form action={action}>
 *       <input name="title" />
 *       <button disabled={sub.pending()}>Create</button>
 *       <p>{() => sub.result()?.error ?? ''}</p>
 *     </Form>
 *   )
 * }
 */
export function useSubmission<T>(action: Action<T>): Submission<T> {
  const id = action.actionId
  const cell = cellFor(id)
  // Resolved at setup (a hook), used later inside event handlers.
  let router: ReturnType<typeof useRouter> | undefined
  try {
    router = useRouter()
  } catch {
    router = undefined
  }

  const submit: Submission<T>['submit'] = async (data, options) => {
    if (isServer) {
      throw new Error(
        '[Pyreon] useSubmission().submit() was called during server rendering. Submit from an event handler.',
      )
    }
    const formData = toFormData(data)
    const version = ++cell.version
    batch(() => {
      cell.pending.set(true)
      cell.input.set(formData)
      cell.error.set(undefined)
    })
    let body: EnhancedActionResponse
    try {
      const response = await fetch(actionUrl(id, options?.url), {
        method: 'POST',
        body: formData,
        headers: { [ENHANCED_ACTION_HEADER]: '1', Accept: 'application/json' },
      })
      body = (await response.json()) as EnhancedActionResponse
    } catch (err) {
      body = { kind: 'error', message: err instanceof Error ? err.message : 'Network error' }
    }
    if (version !== cell.version) return // superseded by a newer submission

    if (body.kind === 'redirect') {
      batch(() => {
        cell.pending.set(false)
        cell.input.set(undefined)
      })
      if (router) await router.push(body.to)
      else globalThis.location.assign(body.to)
      return
    }

    batch(() => {
      cell.pending.set(false)
      cell.input.set(undefined)
      if (body.kind === 'error') {
        cell.error.set(body.message)
        cell.status.set(500)
      } else {
        cell.result.set(body.data)
        cell.status.set(body.status)
      }
    })

    if (body.kind === 'data' && body.status < 400 && router) {
      const revalidate = options?.revalidate ?? true
      if (revalidate === true) await router.revalidate()
      else if (revalidate !== false) {
        const keys = new Set(revalidate)
        router.invalidateLoader((key) => keys.has(key))
      }
    }
  }

  return {
    pending: () => cell.pending(),
    input: () => cell.input(),
    result: () => cell.result() as ActionData<T> | undefined,
    status: () => cell.status(),
    error: () => cell.error(),
    submit,
    reset: () =>
      batch(() => {
        cell.result.set(undefined)
        cell.status.set(undefined)
        cell.error.set(undefined)
      }),
  }
}

/** The router's current `pathname + search` (internal signal), or `''` without a router. */
function currentPathOf(router: ReturnType<typeof useRouter> | undefined): string {
  const path = (router as { _currentPath?: () => string } | undefined)?._currentPath
  return typeof path === 'function' ? path() : ''
}

// ─── <Form> ─────────────────────────────────────────────────────────────────

/** Props for {@link Form}. */
export interface FormProps<T> extends SubmitOptions {
  /** The action to run — a `defineAction()` result (often the route's own `action` export). */
  action: Action<T>
  /**
   * Reset the form's fields after a successful enhanced submission.
   * Default `true` (the no-JS path reloads the page, which resets it too).
   */
  resetOnSuccess?: boolean
  /** Called after a successful enhanced submission settles. */
  onSuccess?: (data: ActionData<T>) => void
  children?: VNodeChild
  [attr: string]: unknown
}

/**
 * A `<form method="post">` bound to a server action that works WITHOUT
 * JavaScript and is enhanced to `fetch` when JavaScript runs. See the
 * module docs for the protocol; pair it with {@link useSubmission} for
 * pending and result state.
 *
 * @example
 * <Form action={action} class="new-post">
 *   <input name="title" required />
 *   <button type="submit">Create</button>
 * </Form>
 */
export function Form<T>(props: FormProps<T>): VNodeChild {
  const [own, rest] = splitProps(props, [
    'action',
    'revalidate',
    'resetOnSuccess',
    'onSuccess',
    'children',
  ])
  const id = own.action.actionId
  const sub = useSubmission(own.action)
  let router: ReturnType<typeof useRouter> | undefined
  try {
    router = useRouter()
  } catch {
    router = undefined
  }
  const snapshot = isServer ? serverSnapshotReader?.() : readHydratedSnapshot(id)
  const hydrated = snapshot && snapshot.id === id ? snapshot : undefined

  const onSubmit = async (e: SubmitEvent): Promise<void> => {
    if (e.defaultPrevented) return
    const form = e.currentTarget as HTMLFormElement
    e.preventDefault()
    const submitter = e.submitter
    const formData = submitter ? new FormData(form, submitter) : new FormData(form)
    await sub.submit(formData, {
      url: form.action,
      ...(own.revalidate !== undefined ? { revalidate: own.revalidate } : {}),
    })
    const status = sub.status()
    if (status !== undefined && status < 400 && !sub.error()) {
      if (own.resetOnSuccess !== false) form.reset()
      own.onSuccess?.(sub.result() as ActionData<T>)
    }
  }

  // `mergeProps`, not an object spread: a spread reads every getter on
  // `rest` once, freezing any reactive attribute (`class={cls()}`) at its
  // first value. Descriptors are copied, so those attributes stay live.
  const formProps: Props = mergeProps(rest as Props, {
    method: 'post',
    // Reactive: a client-side query change updates the attribute. The
    // router's current path is `pathname + search` on both server (the
    // request URL) and client, so SSR and hydration agree.
    action: () => formActionSearch(id, currentPathOf(router)),
    onSubmit,
  })
  // `h()` rather than `<form {...formProps}>`: a JSX spread is an object
  // spread under a plain JSX runtime (tests, other bundlers), which would read
  // the getters and freeze the reactive attributes `mergeProps` preserved.
  return h(
    'form',
    formProps,
    // The server's result, for hydration. An ATTRIBUTE, not an inline
    // script: attribute escaping is the renderer's job, so no raw-HTML
    // sink; and a <template> is inert and never submitted.
    hydrated
      ? h('template', { 'data-zero-action-result': id, 'data-value': JSON.stringify(hydrated) })
      : null,
    own.children,
  )
}
