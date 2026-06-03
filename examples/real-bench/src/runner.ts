import type { Scenario } from './scenarios'
import { computeStats, type Stats } from './stats'
import type { AppFactory } from './types'

const WARMUP_MIN = 5
const WARMUP_MAX = 15

declare global {
  interface Window {
    gc?: () => void
  }
}

/** Force GC between iterations when Chromium was launched with --expose-gc. */
function maybeGc(): void {
  if (typeof window.gc === 'function') window.gc()
}

/**
 * Run one scenario against one framework for `runs` timed iterations, with
 * adaptive warmup (stop once the rolling p90 of the last 3 samples is within
 * 10% of the prior 3) and a forced GC between every iteration. Each iteration:
 * fresh app → untimed setup → GC → time(act + commit) → DOM-verify → unmount.
 */
async function runScenario(
  factory: AppFactory,
  scenario: Scenario,
  container: HTMLElement,
  runs: number,
): Promise<Stats> {
  async function oneIteration(): Promise<number> {
    const app = factory()
    await app.mount(container)
    scenario.setup(app)
    await app.commit()
    maybeGc()

    const start = performance.now()
    scenario.act(app)
    await app.commit()
    const elapsed = performance.now() - start

    scenario.verify(container)
    app.unmount()
    return elapsed
  }

  // Adaptive warmup.
  const warm: number[] = []
  for (let i = 0; i < WARMUP_MAX; i++) {
    warm.push(await oneIteration())
    if (i + 1 >= WARMUP_MIN && warm.length >= 6) {
      const last3 = warm.slice(-3).sort((a, b) => a - b)
      const prev3 = warm.slice(-6, -3).sort((a, b) => a - b)
      const p90a = last3[2] ?? 0
      const p90b = prev3[2] ?? 0
      if (p90b > 0 && Math.abs(p90a - p90b) / p90b < 0.1) break
    }
  }

  const samples: number[] = []
  for (let i = 0; i < runs; i++) samples.push(await oneIteration())
  return computeStats(samples)
}

export interface FrameworkResult {
  framework: string
  scenarios: Record<string, Stats>
}

/** Run every scenario for one framework, sequentially, in this page. */
export async function runFramework(
  factory: AppFactory,
  scenarios: Scenario[],
  container: HTMLElement,
  runs: number,
  onProgress?: (msg: string) => void,
): Promise<FrameworkResult> {
  const name = factory().name
  const result: FrameworkResult = { framework: name, scenarios: {} }
  for (const scenario of scenarios) {
    onProgress?.(`${name} · ${scenario.name}`)
    result.scenarios[scenario.name] = await runScenario(factory, scenario, container, runs)
    container.replaceChildren()
  }
  return result
}
