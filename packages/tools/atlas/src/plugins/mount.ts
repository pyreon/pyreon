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
import type { ComponentIntelligence, ComponentRef, PlayFn, VerifyCheck } from '../core'
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
/** Step timings, off unless `ATLAS_PROFILE=1`. See `pluginProfile`. */
const PROFILE = process.env.ATLAS_PROFILE === '1'
export const mountSteps = new Map<string, { ms: number; calls: number }>()
function step(key: string, startedAt: number): void {
  if (!PROFILE) return
  const e = mountSteps.get(key) ?? { ms: 0, calls: 0 }
  e.ms += performance.now() - startedAt
  e.calls += 1
  mountSteps.set(key, e)
}

async function settleGraph(
  graphSize: () => number | Promise<number>,
  gc: () => Promise<void>,
  floor: number,
): Promise<number> {
  const tRead = PROFILE ? performance.now() : 0
  let count = await graphSize()
  step('graphSize()', tRead)
  // Iterate on the FLOOR, not on "stable across one sweep": the registry drops
  // a node via FinalizationRegistry callbacks the engine schedules at its own
  // pace, so a count can hold steady for a turn and still be garbage — an
  // early stability exit misread that lag as retention and randomly failed
  // clean scenarios. A real leak still fails after the full runway.
  for (let i = 0; i < 12 && count > floor; i += 1) {
    const tGc = PROFILE ? performance.now() : 0
    await gc()
    step('gc()', tGc)
    const t2 = PROFILE ? performance.now() : 0
    count = await graphSize()
    step('graphSize()', t2)
  }
  return count
}

/** The pair of checks this plugin owns, for one scenario. */
interface ScenarioVerdict {
  interaction: VerifyCheck
  leak: VerifyCheck
}

/** What exercising one scenario produced, with no handle to the mounted tree. */
interface Exercised {
  id: string
  args: Record<string, unknown>
  errors: string[]
  clicks: number
  playFailure?: string
}

/**
 * Mount a scenario, exercise it, dispose it — and keep NOTHING alive.
 *
 * Split out of the verify hook so the leak pass can run it over a batch of
 * scenarios before measuring. The handle is deliberately not returned: it
 * references the (removed) container, and a detached DOM tree keeps its binding
 * closures — and through them every signal and effect — alive, which would read
 * as retention. The check must measure what the SCENARIO retains, not what the
 * checker still holds.
 */
async function exercise(
  dom: DomEnv,
  runtime: MountRuntime,
  component: ComponentRef,
  scenario: { id: string; args?: Record<string, unknown>; play?: PlayFn },
  wrapper: ComponentRef | undefined,
): Promise<Exercised> {
  const args = scenario.args ?? {}
  const tReal = PROFILE ? performance.now() : 0
  let mounted: MountedScenario | undefined = mountScenario(dom, runtime, component, args, wrapper)
  step('real mount', tReal)
  let clicks = 0
  let playFailure: string | undefined
  try {
    if (scenario.play) {
      // The author has said what "exercised" means for this scenario — run
      // THAT, not the automatic click-walk. A throw (an assertion, a missing
      // element) is reported by the step it died in.
      let current = ''
      try {
        await scenario.play({
          root: mounted.container,
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
      const tDrive = PROFILE ? performance.now() : 0
      clicks = driveInteractions(mounted)
      step('driveInteractions', tDrive)
    }
  } finally {
    // Unmount inside the same window so a teardown error counts as a finding
    // for THIS scenario rather than leaking into the next one.
    mounted.dispose()
  }
  const errors = [...mounted.errors]
  mounted = undefined
  return { id: scenario.id, args, errors, clicks, ...(playFailure ? { playFailure } : {}) }
}

/** The interaction verdict for one exercised scenario. */
function interactionVerdict(ex: Exercised, hasWrapper: boolean): VerifyCheck {
  if (ex.errors.length === 0 && !ex.playFailure) {
    // A zero-click run is still a real verdict — mount + unmount without
    // throwing IS the check's core claim — but the verdict must say what it
    // covered. Silently reporting `pass` for a scenario with nothing to click
    // would let "interaction: pass" imply exercise that never happened.
    if (ex.clicks === 0) {
      return {
        status: 'pass',
        findings: ['mounted and unmounted cleanly; no interactive elements to drive'],
      }
    }
    return { status: 'pass' }
  }
  const findings = [
    ...ex.errors.map((e) => `threw while mounted: ${e}`),
    ...(ex.playFailure ? [ex.playFailure] : []),
  ]
  if (!hasWrapper) {
    // The most common first failure by a wide margin, and the one whose cause
    // is least obvious from the message alone: a design-system component
    // reading a theme token out of a context nothing provided.
    findings.push(
      'no wrapper is configured — if this component needs providers (theme, router, i18n), export `wrapper` from atlas.config.ts',
    )
  }
  return { status: 'fail', findings }
}

/**
 * How many scenarios share one GC.
 *
 * The leak verdict costs a full `Bun.gc(true)` — measured at ~17-20ms once a
 * design system is loaded — and a per-scenario check pays it per scenario. But
 * ONE GC answers the question for a whole batch: if the graph returns to its
 * baseline after N scenarios have been mounted and disposed, none of the N
 * retained anything. Only a batch that comes back dirty needs the scenarios
 * separated, and that path is the rare one.
 *
 * Bounded rather than whole-component because the scenarios in flight hold
 * their nodes until the sweep: a component with 150 generated variants would
 * otherwise pile all 150 up before anything is reclaimed.
 *
 * 32 is measured, not guessed. Across 1,4,16,32,64,128 on `@pyreon/ui-components`
 * the curve flattens hard after 32 (16 → 6.9s, 32 → 5.6s, 64 → 7.2s, 128 → 5.3s):
 * past that point the extra garbage held in flight costs about as much in sweep
 * time as the saved sweeps recover. 32 sits at the knee with the tightest
 * spread, and keeps the peak heap modest — which matters more on a monorepo
 * scan than the last few percent.
 */
const LEAK_BATCH = 32

export function mountPlugin(options: MountPluginOptions = {}): AtlasPlugin {
  // Memoised HERE rather than written back onto `options`: the caller owns that
  // object and may well pass it to something else, and a plugin quietly adding
  // a field to it is a side effect nobody asked for.
  let runtime: MountRuntime | undefined = options.runtime

  // ── The resting graph, carried ACROSS scenarios ──────────────────────────
  //
  // `settleGraph` after a scenario leaves the graph at rest with nothing of
  // that scenario alive. That value IS the next scenario's baseline — the two
  // measure the same thing — so re-deriving it per scenario buys nothing and
  // costs a full settle each time. Measured on `@pyreon/ui-components` (108
  // components, 1090 scenarios), the baseline settle alone was 26.6s of a 56.4s
  // scan: 47% of the whole command spent re-answering a question already
  // answered by the previous scenario.
  //
  // The WARM-UP mount is still needed, but only when the component CHANGES: its
  // purpose is to let a component's first mount create whatever module-level
  // singletons it retains by design (a store registry, a memoized theme) so
  // those are inside the baseline rather than attributed to the scenario. That
  // is a per-component property, not a per-scenario one. Keyed on the component
  // FUNCTION identity rather than its name, because two packages may both
  // export `Button` and they are different components.
  let restingGraph: number | undefined
  // Per-component verdicts, computed in one pass on the first scenario asked
  // for. Keyed on the ComponentIntelligence OBJECT, not on the component
  // function: the pipeline decorates once and passes that same object to every
  // scenario's verify, so object identity is exactly "these scenarios, this
  // component". Keying on the function instead would merge two intelligences
  // that happen to share one — a component discovered under two projects, or
  // two verifies of the same function with different scenario sets — and serve
  // the first one's verdicts for the second one's scenarios.
  const verified = new WeakMap<object, Map<string, ScenarioVerdict>>()

  return defineAtlasPlugin({
    name: 'atlas:mount',
    async verify(ctx: VerifyContext): Promise<{ interaction: VerifyCheck; leak: VerifyCheck }> {
      const component = ctx.component.component
      if (typeof component !== 'function') {
        // Metadata-only intelligence: the catalog knows the component's shape
        // but was never handed the function. Nothing to mount.
        return { interaction: { status: 'skip' }, leak: { status: 'skip' } }
      }

      // Every scenario of this component is verified together, on the first one
      // that asks. The pipeline calls this hook once per scenario, but the
      // expensive half — proving nothing was retained — is answered for a whole
      // batch by a single GC, so computing it per scenario pays the same sweep
      // over and over for an answer that covers all of them.
      let byId = verified.get(ctx.component)
      if (!byId) {
        byId = await verifyComponent(ctx.component, component)
        verified.set(ctx.component, byId)
      }
      const found = byId.get(ctx.scenario.id)
      if (found) return found

      // A scenario the component pass did not see. It can only happen if the
      // scenario list changed between decorate and verify, which nothing does
      // today — but returning a fabricated pass for an unknown id is exactly
      // the false-green `checked` exists to prevent, so it is verified alone.
      const single = await verifyComponent(
        { ...ctx.component, scenarios: [ctx.scenario] },
        component,
      )
      const one = single.get(ctx.scenario.id)
      if (one) {
        byId.set(ctx.scenario.id, one)
        return one
      }
      return { interaction: { status: 'skip' }, leak: { status: 'skip' } }
    },
  })

  /** Exercise and verify every scenario of one component. */
  async function verifyComponent(
    ci: ComponentIntelligence,
    component: ComponentRef,
  ): Promise<Map<string, ScenarioVerdict>> {
    const out = new Map<string, ScenarioVerdict>()
    const scenarios = ci.scenarios ?? []
    if (scenarios.length === 0) return out

    const dom = await getDom()
    if (!dom.ok) {
      const skip: ScenarioVerdict = {
        interaction: { status: 'skip', findings: [dom.reason] },
        leak: { status: 'skip', findings: [dom.reason] },
      }
      for (const s of scenarios) out.set(s.id, skip)
      return out
    }

    runtime ??= await defaultRuntime()

    // The leak check needs two capabilities, both honestly optional: the
    // reactive-graph registry from the COMPONENTS' OWN framework instance, and
    // a GC hook (the verdict is "nodes stayed in the graph PAST GC" — without
    // GC that claim cannot be made). Missing either → SKIP with the reason,
    // never a fabricated pass.
    const graphSize = runtime.reactiveGraphSize
    const gc = runtime.collectGarbage
    const leakReason = !graphSize
      ? 'reactive-graph introspection unavailable (production build of @pyreon/reactivity)'
      : !gc
        ? 'no GC hook — run the scan under bun, or node --expose-gc'
        : undefined
    const hasWrapper = Boolean(options.wrapper)

    if (leakReason) {
      // No leak verdict is possible, so there is nothing to batch for — just
      // exercise each scenario for its interaction verdict.
      for (const s of scenarios) {
        const ex = await exercise(dom.env, runtime, component, s, options.wrapper)
        out.set(s.id, {
          interaction: interactionVerdict(ex, hasWrapper),
          leak: { status: 'skip', findings: [leakReason] },
        })
      }
      return out
    }

    // A WARM-UP mount+dispose before the baseline: a component's first mount
    // may lazily create module-level singletons (a store registry, a memoized
    // theme) that are retained BY DESIGN. Measuring from the second mount
    // attributes only per-instance retention to the scenario — the thing that
    // actually leaks per mount.
    const tWarm = PROFILE ? performance.now() : 0
    mountScenario(dom.env, runtime, component, scenarios[0]!.args ?? {}, options.wrapper).dispose()
    step('warmup mount+dispose', tWarm)
    // Floor at the previous component's resting value rather than 0: the graph
    // never returns to zero once anything has been mounted (module-level
    // signals are retained on purpose), so a 0 floor asks the loop for
    // something unreachable and burns its whole runway proving it.
    //
    // Settled SEPARATELY from the first batch, deliberately. Folding the two
    // together saves a sweep per component and measured slightly faster at the
    // minimum (4.8s vs 5.5s) — but with double the spread, because a component
    // that retains anything by design then makes its first batch look dirty and
    // pays a full per-scenario bisect. Predictable beats 13% here: the bisect
    // path is the expensive one, and a design that enters it as a matter of
    // course on singleton-holding components scales badly on exactly the
    // codebases that have them.
    const tBase = PROFILE ? performance.now() : 0
    let baseline = await settleGraph(graphSize!, gc!, restingGraph ?? 0)
    step('settleGraph(baseline)', tBase)

    for (let i = 0; i < scenarios.length; i += LEAK_BATCH) {
      const batch = scenarios.slice(i, i + LEAK_BATCH)
      const exercised: Exercised[] = []
      for (const s of batch) {
        exercised.push(await exercise(dom.env, runtime, component, s, options.wrapper))
      }

      const tA = PROFILE ? performance.now() : 0
      const after = await settleGraph(graphSize!, gc!, baseline)
      step('settleGraph(batch)', tA)

      if (after <= baseline) {
        // The graph came back to where it started after mounting and disposing
        // every scenario in the batch — so none of them retained anything. One
        // sweep, one answer, for all of them.
        for (const ex of exercised) {
          out.set(ex.id, { interaction: interactionVerdict(ex, hasWrapper), leak: { status: 'pass' } })
        }
        baseline = after
        continue
      }

      // Something in this batch retained nodes. Only now is it worth paying a
      // sweep per scenario, and only for this batch.
      step('batch dirty → bisect', PROFILE ? performance.now() : 0)
      let floor = after
      for (const ex of exercised) {
        const leak = await bisectLeak(dom.env, runtime!, component, ex, floor, graphSize!, gc!)
        out.set(ex.id, { interaction: interactionVerdict(ex, hasWrapper), leak: leak.check })
        floor = leak.resting
      }
      baseline = floor
    }

    restingGraph = baseline
    return out
  }

  /**
   * Whether ONE scenario retains nodes across repeated mounts.
   *
   * The slow path, reached only when a batch came back dirty. A real leak
   * ACCUMULATES: every additional mount strands more nodes. An engine straggler
   * (a FinalizationRegistry callback that outlives the runway) does not — it is
   * the same 1-3 nodes wherever it lands. So growth alone is not the verdict:
   * mount the scenario again and require the count to keep CLIMBING. One false
   * failure costs more trust than ten true ones earn.
   */
  async function bisectLeak(
    dom: DomEnv,
    rt: MountRuntime,
    component: ComponentRef,
    ex: Exercised,
    floor: number,
    graphSize: NonNullable<MountRuntime['reactiveGraphSize']>,
    gc: NonNullable<MountRuntime['collectGarbage']>,
  ): Promise<{ check: VerifyCheck; resting: number }> {
    let first: MountedScenario | undefined = mountScenario(dom, rt, component, ex.args, options.wrapper)
    first.dispose()
    first = undefined
    const afterA = await settleGraph(graphSize, gc, floor)
    if (afterA <= floor) return { check: { status: 'pass' }, resting: afterA }

    let again: MountedScenario | undefined = mountScenario(dom, rt, component, ex.args, options.wrapper)
    again.dispose()
    again = undefined
    const afterB = await settleGraph(graphSize, gc, afterA)
    if (process.env.ATLAS_DEBUG_LEAK) {
      process.stderr.write(`[leak-debug] ${ex.id}: floor=${floor} afterA=${afterA} afterB=${afterB}\n`)
    }
    if (afterB <= afterA) return { check: { status: 'pass' }, resting: afterB }
    return {
      check: {
        status: 'fail',
        findings: [
          `reactive-graph node count climbed ${floor} → ${afterA} → ${afterB} across ` +
            'repeated mounts and stayed grown past GC — effects/computeds/signals created ' +
            'per mount are not disposed (the subscription-retention leak class)',
        ],
      },
      resting: afterB,
    }
  }
}
