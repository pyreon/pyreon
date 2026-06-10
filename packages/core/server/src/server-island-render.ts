/**
 * Server-island fragment renderer — SERVER-ONLY (imports
 * `@pyreon/runtime-server`). Consumed by zero's auto-mounted fragment
 * endpoint (`GET /_pyreon/fragment/<name>?props=<encoded>`); exported from
 * the main `@pyreon/server` barrel so custom servers can mount their own
 * endpoint. The client-safe half (the `serverIsland()` marker component +
 * registry) lives in `server-island.ts`.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { decodeIslandProps } from './island-codec'
import { provideRequestLocals } from './middleware'
import { getRegisteredServerIslands } from './server-island'

export type FragmentResult =
  | { kind: 'html'; html: string; cacheControl: string }
  | { kind: 'not-found' }
  | { kind: 'bad-props' }

/**
 * Render one registered server island to an HTML fragment, inside a fresh
 * request context (so `useRequestLocals()` and request-scoped stores work
 * inside the fragment exactly like a page render — `renderToString`
 * inherits the active request context).
 *
 * - Unregistered `name` → `not-found` (the endpoint's allowlist — never
 *   renders arbitrary components).
 * - Unparseable `props` → `bad-props` (malformed/hostile query strings
 *   must not 500 the server).
 * - Render errors PROPAGATE — the caller maps them to a 500 (a broken
 *   fragment is a bug to surface, not to swallow).
 */
export async function renderServerIslandFragment(
  name: string,
  rawProps: string | null,
  locals: Record<string, unknown> = {},
): Promise<FragmentResult> {
  const entry = getRegisteredServerIslands().get(name)
  if (!entry) return { kind: 'not-found' }

  let props: Record<string, unknown> = {}
  if (rawProps) {
    try {
      const decoded = decodeIslandProps(JSON.parse(rawProps))
      if (decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)) {
        props = decoded as Record<string, unknown>
      }
    } catch {
      return { kind: 'bad-props' }
    }
  }

  const mod = await entry.loader()
  const Component = (
    typeof mod === 'function' ? mod : (mod as { default: ComponentFn }).default
  ) as ComponentFn

  const html = await runWithRequestContext(async () => {
    provideRequestLocals(locals)
    return renderToString(h(Component, props as never))
  })

  return {
    kind: 'html',
    html,
    cacheControl: entry.options.cache ?? 'no-store',
  }
}
