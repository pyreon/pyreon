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
import { defaultRuntime, driveInteractions, type MountedScenario, type MountRuntime, mountScenario } from '../verify/harness'

/**
 * One DOM per process, created on first use.
 *
 * Deliberately a singleton rather than per-scenario: installing and tearing
 * down globals around every mount would be both slow and wrong — the framework
 * keeps module-level state (delegation roots, the style sheet) that would end
 * up pointing at a DOM that no longer exists. `releaseVerifyDom` exists for
 * tests and for a long-lived host that wants the globals back.
 */
type DomOutcome = Awaited<ReturnType<typeof ensureDom>>

let domPromise: Promise<DomOutcome> | null = null
let domEnv: DomEnv | null = null

function getDom(): Promise<DomOutcome> {
  // A REJECTION is converted, not propagated, and never cached.
  //
  // `ensureDom` reports "no DOM" as a value, but it can still throw — a
  // happy-dom constructor that dies on this runtime, a `defineProperty` that
  // is refused. Letting that escape breaks the check's entire contract: the
  // plugin promises to SKIP when it cannot mount, and instead the whole scan
  // would die with a stack trace on its first scenario. Caching the rejected
  // promise would then make every later call rethrow the same one.
  domPromise ??= ensureDom()
    .then((result) => {
      if (result.ok) domEnv = result.env
      return result
    })
    .catch((err: unknown) => {
      domPromise = null
      const detail = err instanceof Error ? err.message : String(err)
      return { ok: false as const, reason: `could not create a DOM to mount into: ${detail}` }
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

/**
 * GC until the graph count stops moving (or reaches `floor`), hard-capped.
 *
 * A single sweep is NOT enough: the framework legitimately defers some
 * reclamation by an event-loop turn, and the devtools registry only drops a
 * node once its WeakRef actually dies — a one-pass reading counted
 * garbage-in-flight as retained and failed 37 of the workshop's 40 scenarios.
 * The exact mistake (and fix) the repo's benchmark methodology documents:
 * GC + yield until the counter stops moving, hard-capped.
 */
async function settleGraph(
  graphSize: () => number | Promise<number>,
  gc: () => Promise<void>,
  floor: number,
): Promise<number> {
  let count = await graphSize()
  // Iterate on the FLOOR, not on "stable across one sweep": the registry drops
  // a node via FinalizationRegistry callbacks the engine schedules at its own
  // pace, so a count can hold steady for a turn and still be garbage — an
  // early stability exit misread that lag as retention and randomly failed
  // clean scenarios. A real leak still fails after the full runway.
  for (let i = 0; i < 12 && count > floor; i += 1) {
    await gc()
    count = await graphSize()
  }
  return count
}

export function mountPlugin(options: MountPluginOptions = {}): AtlasPlugin {
  // Memoised HERE rather than written back onto `options`: the caller owns that
  // object and may well pass it to something else, and a plugin quietly adding
  // a field to it is a side effect nobody asked for.
  let runtime: MountRuntime | undefined = options.runtime
  return defineAtlasPlugin({
    name: 'atlas:mount',
    async verify(ctx: VerifyContext): Promise<{ interaction: VerifyCheck; leak: VerifyCheck }> {
      const component = ctx.component.component
      if (typeof component !== 'function') {
        // Metadata-only intelligence: the catalog knows the component's shape
        // but was never handed the function. Nothing to mount.
        return { interaction: { status: 'skip' }, leak: { status: 'skip' } }
      }

      const dom = await getDom()
      if (!dom.ok) {
        return {
          interaction: { status: 'skip', findings: [dom.reason] },
          leak: { status: 'skip', findings: [dom.reason] },
        }
      }

      runtime ??= await defaultRuntime()

      // The leak check needs two capabilities, both honestly optional: the
      // reactive-graph registry from the COMPONENTS' OWN framework instance,
      // and a GC hook (the verdict is "nodes stayed in the graph PAST GC" —
      // without GC that claim cannot be made). Missing either → SKIP with the
      // reason, never a fabricated pass.
      const graphSize = runtime.reactiveGraphSize
      const gc = runtime.collectGarbage
      const leakReason = !graphSize
        ? 'reactive-graph introspection unavailable (production build of @pyreon/reactivity)'
        : !gc
          ? 'no GC hook — run the scan under bun, or node --expose-gc'
          : undefined

      let baseline = 0
      if (!leakReason) {
        // A WARM-UP mount+dispose before the baseline: a component's first
        // mount may lazily create module-level singletons (a store registry, a
        // memoized theme) that are retained BY DESIGN. Measuring from the
        // second mount attributes only per-instance retention to the scenario
        // — the thing that actually leaks per mount.
        mountScenario(dom.env, runtime, component, ctx.scenario.args, options.wrapper).dispose()
        baseline = await settleGraph(graphSize!, gc!, 0)
      }

      let scenario: MountedScenario | undefined = mountScenario(
        dom.env,
        runtime,
        component,
        ctx.scenario.args,
        options.wrapper,
      )
      let clicks = 0
      let playFailure: string | undefined
      try {
        const play = ctx.scenario.play
        if (play) {
          // The author has said what "exercised" means for this scenario —
          // run THAT, not the automatic click-walk. A throw (an assertion, a
          // missing element) is reported by the step it died in.
          let current = ''
          try {
            await play({
              root: scenario.container,
              step: async (name, run) => {
                current = name
                await run()
              },
            })
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err)
            playFailure = current ? `play failed at step "${current}": ${detail}` : `play failed: ${detail}`
          }
          clicks = 1 // exercised by definition — the zero-click finding is for the auto walk
        } else {
          clicks = driveInteractions(scenario)
        }
      } finally {
        // Unmount inside the same window so a teardown error counts as a
        // finding for THIS scenario rather than leaking into the next one.
        scenario.dispose()
      }
      const errors = [...scenario.errors]
      // RELEASE the harness handle before measuring: it references the
      // (removed) container, and a detached DOM tree keeps its binding
      // closures — and through them every signal/effect object — alive, which
      // keeps their WeakRefs alive, which reads as retention. The check must
      // measure what the SCENARIO retains, not what the checker still holds.
      scenario = undefined

      let leak: VerifyCheck
      if (leakReason) {
        leak = { status: 'skip', findings: [leakReason] }
      } else {
        const afterA = await settleGraph(graphSize!, gc!, baseline)
        let verdictLeak = false
        let afterB = afterA
        if (afterA > baseline) {
          // A real leak ACCUMULATES: every additional mount of the same
          // scenario strands more nodes. An engine straggler (a
          // FinalizationRegistry callback that outlives the runway) does not —
          // it is the same 1-3 nodes wherever it lands. So growth alone is not
          // the verdict: mount the scenario once more and require the count to
          // keep CLIMBING. A per-mount leak always does (baseline < A < B); a
          // straggler almost never lands twice in ascending order. One false
          // failure costs more trust than ten true ones earn.
          let again: MountedScenario | undefined = mountScenario(
            dom.env,
            runtime,
            component,
            ctx.scenario.args,
            options.wrapper,
          )
          again.dispose()
          again = undefined
          afterB = await settleGraph(graphSize!, gc!, afterA)
          verdictLeak = afterB > afterA
        }
        if (process.env.ATLAS_DEBUG_LEAK) {
          process.stderr.write(`[leak-debug] ${ctx.scenario.id}: baseline=${baseline} afterA=${afterA} afterB=${afterB}\n`)
        }
        leak = verdictLeak
          ? {
              status: 'fail',
              findings: [
                `reactive-graph node count climbed ${baseline} → ${afterA} → ${afterB} across ` +
                  'repeated mounts and stayed grown past GC — effects/computeds/signals created ' +
                  'per mount are not disposed (the subscription-retention leak class)',
              ],
            }
          : { status: 'pass' }
      }

      if (errors.length === 0 && !playFailure) {
        // A zero-click run is still a real verdict — mount + unmount without
        // throwing IS the check's core claim — but the verdict must say what it
        // covered. Silently reporting `pass` for a scenario with nothing to
        // click would let "interaction: pass" imply exercise that never
        // happened (the fabricated-pass class, one finding short).
        if (clicks === 0) {
          return {
            interaction: {
              status: 'pass',
              findings: ['mounted and unmounted cleanly; no interactive elements to drive'],
            },
            leak,
          }
        }
        return { interaction: { status: 'pass' }, leak }
      }

      const findings = [
        ...errors.map((e) => `threw while mounted: ${e}`),
        ...(playFailure ? [playFailure] : []),
      ]
      if (!options.wrapper) {
        // The most common first failure by a wide margin, and the one whose
        // cause is least obvious from the message alone: a design-system
        // component reading a theme token out of a context nothing provided.
        findings.push(
          'no wrapper is configured — if this component needs providers (theme, router, i18n), export `wrapper` from atlas.config.ts',
        )
      }
      return { interaction: { status: 'fail', findings } , leak }
    },
  })
}
