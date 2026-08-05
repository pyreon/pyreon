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

/**
 * Mount and dispose a scenario, exercising NOTHING.
 *
 * The re-probes ask one question — does retention ACCUMULATE across repeated
 * mounts — and mounting is the whole of what they need. Reusing `exercise` for
 * it would re-run the scenario's authored `play`, whose side effects are the
 * author's and are not idempotent by contract; the long-standing per-scenario
 * accumulation check has always used a plain mount for exactly this reason, and
 * a probe that quietly replays a form submission is not a probe.
 *
 * Cheaper too, but that is the smaller half.
 */
function probeMount(
  dom: DomEnv,
  runtime: MountRuntime,
  component: ComponentRef,
  args: Record<string, unknown>,
  wrapper: ComponentRef | undefined,
): void {
  let mounted: MountedScenario | undefined = mountScenario(dom, runtime, component, args, wrapper)
  mounted.dispose()
  mounted = undefined
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
 * Bounded rather than unbounded so a component with thousands of generated
 * variants cannot pile all of them up before anything is reclaimed — but the
 * bound is high, because the memory it was guarding turned out not to exist.
 * Peak RSS across batch sizes 32 / 128 / 256 / 1024 on `@pyreon/ui-components`
 * is 537 / 546 / 547 / 539 MB: flat. The peak is the loaded module graph — Vite
 * plus the design system — not the scenarios in flight.
 *
 * With memory flat, the only axis left is time, and it falls monotonically as
 * batches grow (median 5419ms at 32, 4870ms at 64, 4102ms at 256). 256 is past
 * the point where any real component splits, so in practice this batches a
 * whole component at a time and the bound only engages on pathological ones.
 */
const LEAK_BATCH = 256

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
  /** The catalog-wide pass, started once and awaited by every later scenario. */
  let catalogRun: Promise<void> | undefined

  return defineAtlasPlugin({
    name: 'atlas:mount',
    async verify(ctx: VerifyContext): Promise<{ interaction: VerifyCheck; leak: VerifyCheck }> {
      const component = ctx.component.component
      if (typeof component !== 'function') {
        // Metadata-only intelligence: the catalog knows the component's shape
        // but was never handed the function. Nothing to mount.
        return { interaction: { status: 'skip' }, leak: { status: 'skip' } }
      }

      // The WHOLE CATALOG is verified together, on the first scenario that asks.
      //
      // The pipeline calls this hook once per scenario, but the expensive half —
      // proving nothing was retained — is answered for a whole SWEEP of
      // scenarios by a single GC, and that sweep does not care which component
      // each scenario belonged to. Verifying per component therefore pays one
      // collection per component for an answer a handful of collections give
      // for the entire catalog: on a 1400-component monorepo that is ~2400
      // sweeps against ~10.
      //
      // `ctx.components` is what makes it possible — the pipeline decorates
      // everything before verifying anything, so the full set is in hand here.
      // A caller that does not supply it (a plugin driven directly, as the unit
      // tests do) falls back to this component alone, which is the previous
      // behaviour exactly.
      if (!catalogRun) catalogRun = verifyCatalog(ctx.components ?? [ctx.component])
      await catalogRun
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

  /**
   * Verify the WHOLE catalog with as few garbage collections as possible.
   *
   * The optimistic path is one sweep for everything: warm every component up,
   * exercise every scenario, collect once, and if the graph came back to where
   * it started then nothing anywhere retained a node. That is a complete,
   * exact answer for the entire catalog — the same claim the per-component pass
   * makes, just not repeated N times.
   *
   * When it does NOT come back, this pass records nothing and returns. Every
   * component then falls through to `verifyComponent`, which is the previous
   * behaviour unchanged. So the worst case is one wasted sweep on top of what
   * the scan used to cost, and the best case — the overwhelmingly common one,
   * because most catalogs leak nothing — collapses thousands of collections
   * into one.
   */
  async function verifyCatalog(components: readonly ComponentIntelligence[]): Promise<void> {
    const mountable = components.filter((ci) => typeof ci.component === 'function' && (ci.scenarios?.length ?? 0) > 0)
    // Below two components there is nothing to amortise across, and the extra
    // sweep would be pure overhead against the per-component path.
    if (mountable.length < 2) return

    const dom = await getDom()
    if (!dom.ok) return // the per-component path reports the skip, with its reason

    runtime ??= await defaultRuntime()
    const graphSize = runtime.reactiveGraphSize
    const gc = runtime.collectGarbage
    // No leak verdict is possible at all, so there is nothing to amortise.
    if (!graphSize || !gc) return

    const hasWrapper = Boolean(options.wrapper)

    // Whole components, grouped until the group holds about `LEAK_BATCH`
    // scenarios. Two reasons, and the second is the one that matters more.
    //
    // Memory: the scenarios in a group hold their nodes until its sweep. Peak
    // RSS measured FLAT across 32/128/256/1024 scenarios per sweep — the peak
    // is the loaded module graph, not the scenarios in flight — but that was
    // measured on a 1090-scenario catalog, and a monorepo scan is several times
    // that. An unbounded group would be extrapolating past what was measured.
    //
    // Blast radius: a group is the unit that falls back. Ungrouped, ONE leaking
    // component anywhere would send the entire catalog through the per-scenario
    // path — the slowest one — on exactly the large catalogs this exists for.
    // Grouped, only its own group pays.
    //
    // Groups hold WHOLE components so a verdict is never split across sweeps.
    const groups: ComponentIntelligence[][] = []
    let group: ComponentIntelligence[] = []
    let held = 0
    for (const ci of mountable) {
      group.push(ci)
      held += ci.scenarios.length
      if (held >= LEAK_BATCH) {
        groups.push(group)
        group = []
        held = 0
      }
    }
    if (group.length > 0) groups.push(group)

    for (const members of groups) await verifyGroup(members, dom.env, runtime, graphSize, gc, hasWrapper)
  }

  /**
   * One sweep for a group of components — the fast path, with its own fallback.
   *
   * Records nothing unless the sweep proves it: a group whose retention keeps
   * climbing leaves its components unrecorded, and each then falls through to
   * `verifyComponent`. No verdict is ever written optimistically and retracted.
   */
  async function verifyGroup(
    mountable: readonly ComponentIntelligence[],
    dom: DomEnv,
    rt: MountRuntime,
    graphSize: NonNullable<MountRuntime['reactiveGraphSize']>,
    gc: NonNullable<MountRuntime['collectGarbage']>,
    hasWrapper: boolean,
  ): Promise<void> {
    const tAll = PROFILE ? performance.now() : 0

    // Warm every component up FIRST. A component's first mount may create
    // module-level singletons it retains by design, and those have to be inside
    // the baseline rather than showing up as group-wide retention.
    for (const ci of mountable) {
      mountScenario(dom, rt, ci.component as ComponentRef, ci.scenarios[0]!.args ?? {}, options.wrapper).dispose()
    }
    const baseline = await settleGraph(graphSize, gc, restingGraph ?? 0)

    // Exercise everything. Verdicts are held locally until the sweep says
    // whether they can be trusted — recording them first and retracting later
    // would be the optimistic-verdict design this deliberately avoids.
    const pending = new Map<object, Map<string, ScenarioVerdict>>()
    for (const ci of mountable) {
      const byId = new Map<string, ScenarioVerdict>()
      for (const scenario of ci.scenarios) {
        const ex = await exercise(dom, rt, ci.component as ComponentRef, scenario, options.wrapper)
        byId.set(ex.id, { interaction: interactionVerdict(ex, hasWrapper), leak: { status: 'pass' } })
      }
      pending.set(ci, byId)
    }

    let after = await settleGraph(graphSize, gc, baseline)
    step('settleGraph(catalog)', tAll)

    if (after > baseline) {
      // Something is retained — across a whole catalog, that is much more often
      // an engine straggler than a leak. A FinalizationRegistry callback that
      // outlives the runway strands the same one to three nodes wherever it
      // lands, and with a thousand scenarios in the sweep the chance that none
      // of them produces one is not good. Falling straight through to the
      // per-component path on that basis would forfeit the entire optimization
      // to noise, on exactly the large catalogs it is for.
      //
      // So the same accumulation rule that separates one-time retention from a
      // per-mount leak everywhere else in this plugin is applied here: exercise
      // the catalog again and require the count to keep CLIMBING. A per-mount
      // leak always does — it strands more on every pass. A straggler does not.
      const tRe = PROFILE ? performance.now() : 0
      for (const ci of mountable) {
        for (const scenario of ci.scenarios) {
          // A plain mount, not `exercise`: this only asks whether retention
          // accumulates, and re-running the scenario's authored `play` to find
          // out would replay its side effects.
          probeMount(dom, rt, ci.component as ComponentRef, scenario.args ?? {}, options.wrapper)
        }
      }
      const again = await settleGraph(graphSize, gc, after)
      step('settleGraph(catalog re-probe)', tRe)

      if (again > after) {
        // It kept climbing over two passes of the same scenarios. Something in
        // THIS GROUP leaks per mount, and which component is a question this
        // pass cannot answer — guessing is exactly what a leak check must not
        // do. So it records nothing for the group and lets the per-component
        // path work it out. The resting value is real and is carried forward,
        // so that path starts from a correct floor rather than a stale one.
        restingGraph = again
        step('catalog dirty → per-component', PROFILE ? performance.now() : 0)
        return
      }
      after = again
    }

    for (const [ci, byId] of pending) verified.set(ci, byId)
    restingGraph = after
  }

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
    // The warm-up's OWN garbage is deliberately left for the first batch's
    // sweep. Settling here as well would collect it a few milliseconds earlier
    // at the cost of a whole extra GC per component — and the graph only has to
    // be at a known floor by the time a verdict is read, not before.
    let baseline = restingGraph ?? 0

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

      // Something is retained — but "retained" is not yet "leaked". A component
      // whose FIRST mount creates a module-level singleton (a store registry, a
      // memoized theme) holds it by design and holds it exactly once, and this
      // is the batch where that happens.
      //
      // The two are told apart the same way `bisectLeak` tells them apart, but
      // at BATCH granularity: run the batch again and see whether the count
      // keeps climbing. One-time retention does not; a per-mount leak always
      // does. That costs one extra sweep for the components that have
      // singletons, instead of a per-scenario sweep for every scenario they
      // own — and it is why the warm-up above no longer needs its own settle.
      const tRe = PROFILE ? performance.now() : 0
      for (const s of batch) {
        // A plain mount, not `exercise` — see `probeMount`. This asks only
        // whether retention accumulates, and re-running the scenario's authored
        // `play` to find out would replay its side effects.
        probeMount(dom.env, runtime, component, s.args ?? {}, options.wrapper)
      }
      const again = await settleGraph(graphSize!, gc!, after)
      step('settleGraph(batch re-probe)', tRe)

      if (again <= after) {
        // Retention that did not grow on a second pass over the same scenarios
        // is one-time, not per-mount. Every scenario in the batch passes, and
        // the new resting value becomes the floor.
        for (const ex of exercised) {
          out.set(ex.id, { interaction: interactionVerdict(ex, hasWrapper), leak: { status: 'pass' } })
        }
        baseline = again
        continue
      }

      // It kept climbing across two passes over the same scenarios. Something
      // here leaks per mount, and only now is it worth a sweep per scenario to
      // say which.
      step('batch dirty → bisect', PROFILE ? performance.now() : 0)
      let floor = again
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
