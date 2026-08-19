/**
 * CROSSOVER suite entry point — dispatches `?framework=` to one arm.
 *
 * Mirrors `impl/hydration.ts`'s shape: one lazy-imported module so the main
 * DOM suite's bundle is untouched, one exported name list so `main.ts` can
 * reject an unknown framework with a useful message instead of a blank page.
 *
 * See `crossover-shared.ts` for the hypothesis this suite tests and the
 * instrument design.
 */
import type { BenchSuite } from '../runner'
import { runCrossoverOctane } from './crossover-octane.tsrx'
import { runCrossoverPyreon } from './crossover-pyreon'
import { runCrossoverSolid } from './crossover-solid'

const ARMS: Record<string, (container: HTMLElement) => Promise<BenchSuite>> = {
  Pyreon: runCrossoverPyreon,
  Octane: runCrossoverOctane,
  SolidJS: runCrossoverSolid,
}

export const CROSSOVER_FRAMEWORK_NAMES = Object.keys(ARMS)

export function runCrossover(framework: string, container: HTMLElement): Promise<BenchSuite> {
  const arm = ARMS[framework]
  if (!arm) throw new Error(`[crossover] unknown framework "${framework}"`)
  return arm(container)
}
