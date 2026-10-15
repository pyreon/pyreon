/**
 * Registry for the coverage-expansion scenarios (`?mode=scenarios`).
 *
 * Kept behind a lazy import from `main.ts` (same as the hydration suite) so the
 * DOM suite's production bundle — which `bench-bundle.ts` measures — is not
 * affected by scenario code that never runs on that path.
 */
import type { BenchSuite } from '../runner'
import { CHARTS_FRAMEWORKS, runCharts } from './scenario-charts'
import { CHARTS_LIBS_FRAMEWORKS, runChartsLibs } from './scenario-charts-libs'
import { DBMON_FRAMEWORKS, runDbmon } from './scenario-dbmon'
import { EFFECTS_FRAMEWORKS, runEffects } from './scenario-effects'
import { FLOW_FRAMEWORKS, runFlow } from './scenario-flow'
import { TABLE_FRAMEWORKS, runTable } from './scenario-table'
import { VIRTUAL_FRAMEWORKS, runVirtual } from './scenario-virtual'
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
  {
    id: 'flow',
    label: 'flow diagram — @pyreon/flow vs React Flow 12 (500 nodes)',
    frameworks: FLOW_FRAMEWORKS,
    run: runFlow,
  },
  {
    id: 'virtual',
    label: 'virtual list — @pyreon/virtual vs @tanstack/react-virtual (10,000 rows)',
    frameworks: VIRTUAL_FRAMEWORKS,
    run: runVirtual,
  },
  {
    id: 'table',
    label: 'data table — @pyreon/table vs @tanstack/react-table (1,000 rows × 6 cols)',
    frameworks: TABLE_FRAMEWORKS,
    run: runTable,
  },
  {
    id: 'charts',
    label: 'charts — @pyreon/charts vs ECharts 6 (line, 1k / 100k points)',
    frameworks: CHARTS_FRAMEWORKS,
    run: runCharts,
  },
  {
    id: 'charts-libs',
    label: 'charts — @pyreon/charts vs uPlot, Chart.js, Recharts (line 1k–1M, update, 1k bars; 800×300)',
    frameworks: CHARTS_LIBS_FRAMEWORKS,
    run: runChartsLibs,
  },
]

export function findScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
