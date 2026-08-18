/**
 * Registry for the coverage-expansion scenarios (`?mode=scenarios`).
 *
 * Kept behind a lazy import from `main.ts` (same as the hydration suite) so the
 * DOM suite's production bundle — which `bench-bundle.ts` measures — is not
 * affected by scenario code that never runs on that path.
 */
import type { BenchSuite } from '../runner'
import { DBMON_FRAMEWORKS, runDbmon } from './scenario-dbmon'
import { runTree, TREE_FRAMEWORKS } from './scenario-tree'

export interface ScenarioDef {
  id: string
  label: string
  frameworks: readonly string[]
  run: (framework: string, container: HTMLElement) => Promise<BenchSuite>
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'dbmon',
    label: 'dbmon — sustained wide update',
    frameworks: DBMON_FRAMEWORKS,
    run: runDbmon,
  },
  {
    id: 'tree',
    label: 'deep tree — component mount + context propagation',
    frameworks: TREE_FRAMEWORKS,
    run: runTree,
  },
]

export function findScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
