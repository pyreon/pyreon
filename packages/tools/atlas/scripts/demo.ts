/**
 * Runnable demo — point Atlas at a few component descriptions, run the full
 * pipeline with the recommended plugin bundle, and print the derived catalog.
 *
 *   bun run --filter='@pyreon/atlas' demo
 *   # or: bun packages/tools/atlas/scripts/demo.ts
 *
 * In a real project the component descriptions come from the `auto` module
 * scanning your source; here we describe three by hand to exercise the pipeline
 * end-to-end with ZERO authored stories.
 */
import { createAtlas } from '@pyreon/atlas'
import { inferControls } from '@pyreon/atlas/core'
import { defineAtlasPlugin } from '@pyreon/atlas/plugins'

const discovery = defineAtlasPlugin({
  name: 'demo-discovery',
  discover: () => [
    {
      name: 'Button',
      controls: inferControls([
        { name: 'label', type: 'string' },
        { name: 'state', type: { union: ['primary', 'secondary', 'danger'] } },
        { name: 'size', type: { union: ['small', 'medium', 'large'] } },
        { name: 'disabled', type: 'boolean' },
      ]),
      axes: [
        { name: 'state', values: ['primary', 'secondary', 'danger'] },
        { name: 'size', values: ['small', 'medium', 'large'] },
      ],
      reactivity: [],
      scenarios: [],
      tags: [],
    },
    {
      name: 'TextInput',
      controls: inferControls([
        { name: 'label', type: 'string' },
        { name: 'placeholder', type: 'string' },
        { name: 'disabled', type: 'boolean' },
        { name: 'error', type: 'boolean' },
      ]),
      axes: [],
      reactivity: [],
      scenarios: [],
      tags: [],
    },
    {
      name: 'Badge',
      controls: inferControls([
        { name: 'label', type: 'string' },
        { name: 'tone', type: { union: ['info', 'success', 'warning', 'danger'] } },
      ]),
      axes: [{ name: 'tone', values: ['info', 'success', 'warning', 'danger'] }],
      reactivity: [],
      scenarios: [],
      tags: [],
    },
  ],
})

// Simple config: just pass discovery — the recommended preset is the default.
const graph = await createAtlas({ plugins: [discovery] }).build()

const scenarios = graph.scenarios()
const flagged = scenarios.filter((s) => s.verify && !s.verify.ok)

console.log(graph.toLlmsText())
console.log('═'.repeat(64))
console.log(
  `Atlas derived ${graph.size()} components and ${scenarios.length} verified ` +
    `scenarios (${flagged.length} flagged) — from ZERO authored stories.\n`,
)

// The AI asset: a compact, prescriptive guide so an agent uses each component
// correctly on the first try, with minimal tokens.
console.log(graph.toAgentGuide())
console.log('═'.repeat(64))

// The search primitive the UI + agents use.
console.log('search("badge") ->', JSON.stringify(graph.search('badge')))
