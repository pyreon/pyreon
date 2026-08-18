/**
 * Registry for the coverage-expansion scenarios (`?mode=scenarios`).
 *
 * Kept behind a lazy import from `main.ts` (same as the hydration suite) so the
 * DOM suite's production bundle — which `bench-bundle.ts` measures — is not
 * affected by scenario code that never runs on that path.
 */
import type { BenchSuite } from '../runner'
import { DBMON_FRAMEWORKS, runDbmon } from './scenario-dbmon'
import { EFFECTS_FRAMEWORKS, runEffects } from './scenario-effects'
import { MEMO_FRAMEWORKS, runMemo } from './scenario-memo'
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
  {
    id: 'effects',
    label: 'effect-heavy list — subscription dispatch, targeting and teardown',
    frameworks: EFFECTS_FRAMEWORKS,
    run: runEffects,
  },
  {
    id: 'memo',
    label: 'memoization wall — blocked vs passthrough derived update',
    frameworks: MEMO_FRAMEWORKS,
    run: runMemo,
  },
]

export function findScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
