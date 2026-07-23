/**
 * Built-in (graph stage): writes a one-line usage summary onto each component
 * that lacks one, from its props + final scenarios (verdicts are already
 * attached by the graph stage). Feeds the `toLlmsText()` agent catalog.
 */
import type { AtlasPlugin } from './types'
import { defineAtlasPlugin } from './define'

export function usageDocsPlugin(): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:usage-docs',
    graph({ graph }) {
      for (const ci of graph.list()) {
        if (ci.summary) continue
        const propNames = ci.controls.map((c) => c.name)
        const passing = ci.scenarios.filter((s) => s.verify?.ok !== false).length
        const props = propNames.length > 0 ? ` Props: ${propNames.join(', ')}.` : ''
        const summary = `${ci.name} — ${ci.scenarios.length} scenario(s), ${passing} passing.${props}`
        graph.add({ ...ci, summary })
      }
    },
  })
}
