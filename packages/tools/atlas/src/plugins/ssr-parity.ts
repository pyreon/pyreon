/**
 * The SSR-parity check — does this scenario survive being server-rendered and
 * hydrated?
 *
 * ── Why this is worth a check of its own ──────────────────────────────────
 *
 * A hydration mismatch is the framework's own first-class bug class: the
 * SSR↔hydration differential fuzz found SIX shipped instances, every one a
 * cursor misalignment where the server's HTML and the client's expectation
 * disagreed about how many DOM nodes a construct occupies. They share a
 * signature — the page renders, then subtly wrong content survives, or a
 * whole subtree is silently orphaned — and none of Atlas's other checks can
 * see it. `interaction` mounts on the client and never renders on a server;
 * `snapshot` photographs one render, so a build that is consistently wrong
 * photographs consistently.
 *
 * Every scenario a catalog already has becomes a parity test at zero
 * authoring cost, which is the whole argument for putting it here rather than
 * asking each project to write hydration tests by hand.
 *
 * ── Two oracles, because one is not enough ────────────────────────────────
 *
 * 1. The runtime's own mismatch channel reported NOTHING.
 * 2. The hydrated DOM equals a FRESH CLIENT MOUNT of the same scenario.
 *
 * The second exists because the first can agree on broken. The fuzz work
 * named this exact failure — an SSR pass and a hydrate pass reaching the same
 * wrong DOM produce zero mismatches, and only a third, independently-built
 * instance reveals it. Dropping oracle 2 would leave a check that passes
 * loudest on the bugs it was built to find.
 *
 * ── What this CANNOT catch, stated plainly ────────────────────────────────
 *
 * A component that branches on a browser-only global — `typeof window`,
 * `matchMedia`, `localStorage` — is the other classic SSR bug, and this check
 * is BLIND to it. Both renders happen in one process, and `ensureDom` installs
 * those globals so the components can mount at all, so the "server" pass sees
 * a browser too and the two sides agree. Reporting a pass there is honest
 * about what ran; believing it means more than that is not.
 *
 * Catching that shape needs the SSR render in a genuinely DOM-free context —
 * a separate process, or a scan whose mount checks are all disabled — which
 * trades away every other check in the same run. The bugs this DOES catch are
 * the structural ones: non-deterministic renders (`Math.random()`, `Date.now()`,
 * per-render ids), components that throw only under `renderToString`, and the
 * framework's own cursor-misalignment class, which is the one the differential
 * fuzz found six live instances of.
 */
import type { ComponentRef, VerifyCheck } from '../core'
import { ensureDom } from '../verify/dom'
import type { MountRuntime } from '../verify/harness'
import { SKIP_REASON, skipped } from './registry'
import type { AtlasPlugin } from './types'

/** Why a parity check could not run. Stated, never silently passed. */
export const SSR_SKIP = {
  noRenderer:
    'no SSR renderer — install `@pyreon/runtime-server` to check that this component hydrates',
} as const

/**
 * Normalise a container's HTML for comparison.
 *
 * Framework markers are STRIPPED. Hydration deliberately leaves anchors the
 * client mount has no reason to emit in the same places (`<!--pyreon-->`,
 * `<!--$-->`/`<!--/$-->` accessor ranges, `<!--k:…-->` keyed-list markers), so
 * comparing them raw reports a difference on every scenario carrying a
 * `<For>` or a reactive accessor — which is most of them. What must agree is
 * the RENDERED content, which is what a user sees and what a mismatch
 * corrupts.
 */
export function normalizeHtml(html: string): string {
  return stripComments(html)
    // Whitespace BETWEEN tags only. Collapsing inside text would hide a real
    // difference between "a  b" and "a b", which is exactly the kind of text
    // corruption a mismatch produces. Linear: `\s+` between two literals has
    // no nested quantifier to backtrack through.
    .replaceAll(/>\s+</g, '><')
    .trim()
}

/**
 * Remove HTML comments, by scanning rather than by regex.
 *
 * The obvious `/<!--[^>]*-->/g` is wrong twice, and CodeQL caught both:
 *
 *  - INCOMPLETE. One pass over `<!--<!-- -->-->` removes the inner comment and
 *    leaves a bare `<!--` behind. Any single-pass regex replace has this
 *    shape — the residue is exactly the token being stripped.
 *  - POLYNOMIAL. `[^>]*` between two literals backtracks on input with many
 *    `<!--` runs, so a component emitting pathological markup could stall the
 *    scan rather than fail it.
 *
 * A scan has neither problem: it is O(n), and it consumes each comment WHOLE,
 * so a `<!--` inside a comment is part of that comment rather than the start
 * of a new one. An unterminated comment drops the remainder, which is what a
 * parser does with it too.
 *
 * Worth being careful about even though this output is only ever COMPARED,
 * never inserted into a document: the function is exported, and "it is not a
 * sink today" is not a property that survives its next caller.
 */
function stripComments(html: string): string {
  let out = ''
  let at = 0
  for (;;) {
    const start = html.indexOf('<!--', at)
    if (start === -1) return out + html.slice(at)
    out += html.slice(at, start)
    const end = html.indexOf('-->', start + 4)
    if (end === -1) return out // unterminated — the rest is comment
    at = end + 3
  }
}

/** A short, readable line per mismatch the runtime reported. */
export function describeMismatch(ctx: unknown): string {
  const c = (ctx ?? {}) as { type?: unknown; path?: unknown; expected?: unknown; actual?: unknown }
  const at = typeof c.path === 'string' && c.path.length > 0 ? ` at ${c.path}` : ''
  return `${String(c.type ?? 'mismatch')}${at}: expected ${short(c.expected)}, DOM had ${short(c.actual)}`
}

/** Values reach here from user components, so cap them — a whole rendered
 * subtree in a finding buries the one line that names the problem. */
function short(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

export interface SsrParityOptions {
  /**
   * The runtime, from the project's own module graph.
   *
   * Same contract as the mount plugin's: absent means the project could not be
   * loaded, and the check skips rather than reporting a verdict about Atlas's
   * copy of the framework.
   */
  runtime?: MountRuntime
  /** Wrap every scenario, exactly as the mount check does. */
  wrapper?: ComponentRef
}

/**
 * Run the two oracles for one scenario.
 *
 * Exported and DOM-injected so the interesting failures — a mismatch reported,
 * an SSR/client divergence, a renderer that throws — are unit-testable without
 * booting a scan.
 */
export async function checkSsrParity(
  runtime: MountRuntime,
  component: ComponentRef,
  args: Record<string, unknown>,
  container: Element,
  clientContainer: Element,
  wrapper?: ComponentRef,
): Promise<VerifyCheck> {
  const { h, mount, renderToString, hydrateRoot, onHydrationMismatch } = runtime
  if (!renderToString || !hydrateRoot || !onHydrationMismatch) {
    return skipped(SSR_SKIP.noRenderer)
  }

  const build = (): unknown => {
    const node = h(component as unknown, args)
    return wrapper ? h(wrapper as unknown, {}, node) : node
  }

  const findings: string[] = []
  let html: string
  try {
    html = await renderToString(build())
  } catch (err) {
    // A component that cannot server-render at all is a real finding, not a
    // skip: it means this scenario is unusable in any SSR app.
    return { status: 'fail', findings: [`renderToString threw: ${message(err)}`] }
  }

  // ── Oracle 1: the runtime's own mismatch channel ────────────────────────
  const mismatches: string[] = []
  const stop = onHydrationMismatch((ctx) => {
    // Capped: one broken construct can report per node, and a thousand
    // identical lines say nothing the first five do not.
    if (mismatches.length < 5) mismatches.push(describeMismatch(ctx))
  })

  let disposeHydrated: (() => void) | undefined
  try {
    // An `innerHTML` assignment, deliberately, and safe here for reasons worth
    // stating rather than leaving the next reader (or scanner) to re-derive:
    //
    //  - `html` is the PROJECT's own `renderToString` output for the PROJECT's
    //    own component. It is not third-party input arriving from a network.
    //  - the container is DETACHED — created here, never appended to a
    //    document — so nothing it contains is in a live tree.
    //  - this whole harness already imports and MOUNTS the project's modules,
    //    which is arbitrary code execution by design and by the user's explicit
    //    opt-in (`--no-mount` declines it). Parsing markup that code produced
    //    crosses no boundary the mount did not already cross.
    //
    // It is also the only faithful way to run the check: hydration's entire
    // contract is "adopt DOM the server produced", so building that DOM any
    // other way would test a different thing.
    container.innerHTML = html
    disposeHydrated = hydrateRoot(container, build())
  } catch (err) {
    // No `stop()` here — the `finally` below always runs, and calling it twice
    // is a double-unsubscribe. Harmless against a Set-backed registry, and a
    // real bug against a refcounted one, where the second call would remove
    // somebody else's handler.
    disposeHydrated?.()
    return { status: 'fail', findings: [`hydrateRoot threw: ${message(err)}`] }
  } finally {
    stop()
  }
  findings.push(...mismatches)

  // ── Oracle 2: does the hydrated DOM match a fresh client mount? ─────────
  let disposeClient: (() => void) | undefined
  try {
    disposeClient = mount(build(), clientContainer)
    const hydrated = normalizeHtml(container.innerHTML)
    const client = normalizeHtml(clientContainer.innerHTML)
    if (hydrated !== client) {
      findings.push(
        'hydrated DOM differs from a fresh client mount — ' +
          `SSR+hydrate produced ${brief(hydrated)}, client mount produced ${brief(client)}`,
      )
    }
  } catch (err) {
    findings.push(`client mount threw while comparing: ${message(err)}`)
  } finally {
    // Both roots are torn down even when the comparison threw: this check runs
    // once per scenario across a whole catalog, and a leaked root would be
    // charged to the LEAK check of some later, innocent scenario.
    disposeClient?.()
    disposeHydrated?.()
  }

  return findings.length > 0 ? { status: 'fail', findings } : { status: 'pass' }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function brief(html: string): string {
  return html.length > 80 ? `${html.slice(0, 77)}…` : html || '(empty)'
}

/**
 * The plugin. Claims exactly the `ssrParity` check and nothing else, so it
 * composes with whatever else is in the pipeline.
 */
export function ssrParityPlugin(options: SsrParityOptions = {}): AtlasPlugin {
  return {
    name: 'atlas:ssr-parity',
    async verify(ctx) {
      const runtime = options.runtime
      if (!runtime) return { ssrParity: skipped(SKIP_REASON.notRun) }
      const component = ctx.component.component
      if (typeof component !== 'function') return { ssrParity: skipped(SKIP_REASON.notRun) }

      // The DOM is acquired here rather than injected, matching the mount
      // plugin: `ensureDom` installs the globals `@pyreon/runtime-dom` reaches
      // for while hydrating, and a container from a document that never
      // installed them hydrates against a different `document` than the runtime
      // sees.
      const dom = await ensureDom()
      if (!dom.ok) return { ssrParity: skipped(dom.reason) }
      const container = dom.env.document.createElement('div')
      const clientContainer = dom.env.document.createElement('div')

      return {
        ssrParity: await checkSsrParity(
          runtime,
          component,
          ctx.scenario.args ?? {},
          container,
          clientContainer,
          options.wrapper,
        ),
      }
    },
  }
}
