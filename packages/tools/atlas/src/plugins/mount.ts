/**
 * Built-in: the first verify check that actually RUNS the component.
 *
 * Everything Atlas could conclude from types alone it already concludes — the
 * static a11y check reads prop shapes and never renders. This one mounts the
 * scenario, clicks through it, and unmounts, so the verdict covers the class no
 * amount of type inference reaches: *these args crash it*.
 *
 * The claim is deliberately narrow — "mounts, survives interaction, unmounts,
 * without throwing" — and nothing more. Two tempting additions were left out on
 * purpose:
 *
 *   - "renders something": a component may legitimately render nothing for a
 *     given scenario (a `<Show>` that is false, a Portal that mounts elsewhere).
 *     Failing on empty output would flag correct components, and one false
 *     failure costs more trust than ten true ones earn.
 *
 *   - "the reactive props are live": the check would have to distinguish a
 *     captured-once prop from a correct one, and that distinction depends on
 *     whether the Pyreon COMPILER transformed the component's source. Under a
 *     plain esbuild/bun transform a perfectly correct `{props.x()}` is static,
 *     so the check would fail working components. It belongs where the compiler
 *     has provably run — the dev server — not in a Node pipeline that cannot
 *     tell which transform produced the function it was handed.
 *
 * A scenario with no component reference, or no DOM to mount into, SKIPS. It
 * does not pass: `checked` exists precisely so "nothing ran" and "nothing was
 * wrong" stay distinguishable.
 */
import type { ComponentRef, VerifyCheck } from '../core'
import { defineAtlasPlugin } from './define'
import type { AtlasPlugin, VerifyContext } from './types'
import { type DomEnv, ensureDom } from '../verify/dom'
import { defaultRuntime, driveInteractions, type MountRuntime, mountScenario } from '../verify/harness'

/**
 * One DOM per process, created on first use.
 *
 * Deliberately a singleton rather than per-scenario: installing and tearing
 * down globals around every mount would be both slow and wrong — the framework
 * keeps module-level state (delegation roots, the style sheet) that would end
 * up pointing at a DOM that no longer exists. `releaseVerifyDom` exists for
 * tests and for a long-lived host that wants the globals back.
 */
let domPromise: Promise<Awaited<ReturnType<typeof ensureDom>>> | null = null
let domEnv: DomEnv | null = null

function getDom(): Promise<Awaited<ReturnType<typeof ensureDom>>> {
  domPromise ??= ensureDom().then((result) => {
    if (result.ok) domEnv = result.env
    return result
  })
  return domPromise
}

/** Restore any globals the verify DOM installed. Idempotent. */
export function releaseVerifyDom(): void {
  domEnv?.teardown()
  domEnv = null
  domPromise = null
}

export interface MountPluginOptions {
  /**
   * Wrap every mounted scenario — the project's providers (theme, router,
   * i18n, a query client).
   *
   * A design-system component usually cannot render alone: mount a themed
   * button with no theme context and it throws reading a token. That failure
   * is REAL — the catalog genuinely cannot render the component as configured,
   * which is the same thing Storybook reports when a story needs a decorator —
   * but the fix is a wrapper, so the finding says so when there is none.
   */
  wrapper?: ComponentRef
  /**
   * The framework instances to mount with — see `MountRuntime`.
   *
   * Supply the ones the COMPONENTS came from. Omitted, Atlas resolves its own,
   * which is correct only when the components were loaded by the same runtime.
   */
  runtime?: MountRuntime
}

export function mountPlugin(options: MountPluginOptions = {}): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:mount',
    async verify(ctx: VerifyContext): Promise<{ interaction: VerifyCheck }> {
      const component = ctx.component.component
      if (typeof component !== 'function') {
        // Metadata-only intelligence: the catalog knows the component's shape
        // but was never handed the function. Nothing to mount.
        return { interaction: { status: 'skip' } }
      }

      const dom = await getDom()
      if (!dom.ok) return { interaction: { status: 'skip', findings: [dom.reason] } }

      const runtime = (options.runtime ??= await defaultRuntime())
      const scenario = mountScenario(dom.env, runtime, component, ctx.scenario.args, options.wrapper)
      try {
        driveInteractions(scenario)
      } finally {
        // Unmount inside the same window so a teardown error counts as a
        // finding for THIS scenario rather than leaking into the next one.
        scenario.dispose()
      }

      const errors = [...scenario.errors]
      if (errors.length === 0) return { interaction: { status: 'pass' } }

      const findings = errors.map((e) => `threw while mounted: ${e}`)
      if (!options.wrapper) {
        // The most common first failure by a wide margin, and the one whose
        // cause is least obvious from the message alone: a design-system
        // component reading a theme token out of a context nothing provided.
        findings.push(
          'no wrapper is configured — if this component needs providers (theme, router, i18n), export `wrapper` from atlas.config.ts',
        )
      }
      return { interaction: { status: 'fail', findings } }
    },
  })
}
