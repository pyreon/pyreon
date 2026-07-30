/**
 * Mount a scenario and drive it.
 *
 * The single seam every runtime verify check sits on. Kept separate from the
 * checks themselves because the awkward parts — capturing an error that is
 * thrown inside an effect rather than returned, tearing down when mounting
 * itself threw — are worth getting right once.
 */
import type { ComponentRef } from '../core'
import type { DomEnv } from './dom'

/**
 * The framework instances used to mount.
 *
 * Injected rather than imported, because WHICH instance matters. When
 * components are loaded through Vite, `@pyreon/vite-plugin` sets
 * `ssr.noExternal: [/@pyreon\//]` — deliberately, so a Pyreon app's SSR build
 * processes the framework — which means Vite owns a copy. Mounting a component
 * from that copy with a `mount` from Atlas's own copy puts two instances in one
 * heap: the singleton sentinel throws `Multiple instances of @pyreon/core
 * detected`, and even silenced, context and lifecycle would be split across two
 * module graphs.
 *
 * So the runtime comes from wherever the component came from.
 */
export interface MountRuntime {
  h: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  mount: (root: unknown, container: Element) => () => void
  registerErrorHandler: (handler: (ctx: unknown) => void) => () => void
}

/**
 * The framework as Atlas itself resolves it.
 *
 * Imported dynamically so a caller that supplies its own runtime never loads a
 * second copy just by importing this module — which is the whole problem above.
 */
export async function defaultRuntime(): Promise<MountRuntime> {
  const [core, dom] = await Promise.all([import('@pyreon/core'), import('@pyreon/runtime-dom')])
  return {
    h: core.h as MountRuntime['h'],
    mount: dom.mount as unknown as MountRuntime['mount'],
    registerErrorHandler: core.registerErrorHandler as unknown as MountRuntime['registerErrorHandler'],
  }
}

/** Elements a user could plausibly click, in document order. */
const INTERACTIVE = 'button,[role="button"],a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'

export interface MountedScenario {
  container: Element
  /** Errors seen so far — from mounting, from an effect, or from a handler. */
  readonly errors: readonly string[]
  /** Clickable elements currently in the tree. */
  interactives(): Element[]
  /** Dispatch a real bubbling click, so delegated handlers actually run. */
  click(el: Element): void
  dispose(): void
}

/**
 * Render a thrown value as a finding.
 *
 * Three shapes arrive here, and only one of them is a plain `Error`: the
 * framework hands its handlers an `ErrorContext` (`{ error, component, phase }`)
 * rather than the error itself, and the DOM reports an uncaught listener
 * exception as an `ErrorEvent`. An earlier cut stringified all three and
 * produced `threw while mounted: [object Object]` — a finding that names
 * nothing is barely better than no finding at all.
 */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const ctx = err as { error?: unknown; message?: unknown; component?: unknown; phase?: unknown }
    const inner = ctx.error !== undefined ? describe(ctx.error) : undefined
    const message = inner ?? (typeof ctx.message === 'string' ? ctx.message : undefined)
    if (message !== undefined) {
      const where = [ctx.component, ctx.phase].filter((p) => typeof p === 'string').join(' ')
      return where ? `${message} (${where})` : message
    }
  }
  return String(err)
}

/**
 * Mount `component` with `args`.
 *
 * Never throws: a component that blows up on mount is the most interesting
 * thing a verify check can find, so it is returned as an error rather than
 * propagated. The container is still returned (empty) so teardown is uniform —
 * a failed mount that leaks its delegation root would poison the next scenario
 * in the same process.
 */
export function mountScenario(
  env: DomEnv,
  runtime: MountRuntime,
  component: ComponentRef,
  args: Record<string, unknown>,
  /** Providers to wrap the scenario in — see `MountPluginOptions.wrapper`. */
  wrapper?: ComponentRef,
): MountedScenario {
  const doc = env.document
  const container = doc.createElement('div')
  doc.body.appendChild(container)

  const errors: string[] = []
  // Two capture paths, because a component has two ways to throw where the
  // caller never sees it.
  //
  //   1. Inside an effect or a component body: the framework routes it to the
  //      registered error handlers rather than letting it propagate.
  //   2. Inside an event listener: the DOM specifies that an uncaught listener
  //      exception is REPORTED, not rethrown — `dispatchEvent` returns
  //      normally and the error surfaces as a window `error` event.
  //
  // With only a `try { mount() }`, both classes verify clean.
  const unregister = runtime.registerErrorHandler((ctx) => {
    errors.push(describe(ctx))
  })
  const view = (doc as { defaultView?: EventTarget | null }).defaultView ?? null
  const onWindowError = (event: Event) => {
    errors.push(describe(event as unknown as { error?: unknown; message?: unknown }))
  }
  view?.addEventListener('error', onWindowError)

  let unmount: (() => void) | undefined
  try {
    const tree = runtime.h(component, args)
    // The wrapper receives the scenario as `children`, so a project's existing
    // provider component works unchanged — no Atlas-specific contract to learn.
    unmount = runtime.mount(wrapper ? runtime.h(wrapper, { children: tree }) : tree, container)
  } catch (err) {
    errors.push(describe(err))
  }

  let disposed = false
  return {
    container,
    errors,
    interactives: () => [...container.querySelectorAll(INTERACTIVE)],
    click(el) {
      try {
        // A constructed, bubbling MouseEvent — not `el.click()` — because
        // Pyreon delegates: the handler lives on the mount root as an expando
        // and only runs for an event that actually bubbles up to it.
        const MouseEventCtor = (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent
        const event = MouseEventCtor
          ? new MouseEventCtor('click', { bubbles: true, cancelable: true })
          : new Event('click', { bubbles: true, cancelable: true })
        el.dispatchEvent(event)
      } catch (err) {
        errors.push(describe(err))
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      try {
        unmount?.()
      } catch (err) {
        errors.push(describe(err))
      }
      unregister()
      view?.removeEventListener('error', onWindowError)
      container.remove()
    },
  }
}

/**
 * Click every interactive element once.
 *
 * Re-reads the list each round because a click can change the tree, and stops
 * after `limit` so a component that mounts a new button per click cannot spin
 * forever. Returns how many clicks were delivered — the mount check reports a
 * zero-click run as a pass WITH a finding saying so (mount + unmount without
 * throwing is its core claim; the count keeps the verdict from implying
 * exercise that never happened).
 */
export function driveInteractions(scenario: MountedScenario, limit = 12): number {
  const seen = new Set<Element>()
  let clicks = 0
  for (let round = 0; round < limit; round++) {
    const next = scenario.interactives().find((el) => !seen.has(el))
    if (!next) break
    seen.add(next)
    scenario.click(next)
    clicks++
  }
  return clicks
}
