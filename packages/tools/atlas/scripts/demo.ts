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
import { components } from '@pyreon/atlas/auto'

// Terse authoring via @pyreon/atlas/auto — controls + variant axes are derived
// from the shape (a union array becomes a `select` + a variant axis; a `?`
// suffix marks a prop optional). This is the WHOLE description.
const catalog = components({
  Button: {
    props: {
      label: 'string',
      state: ['primary', 'secondary', 'danger'],
      size: ['small', 'medium', 'large'],
      'disabled?': 'boolean',
    },
    tags: ['form'],
  },
  TextInput: {
    props: { label: 'string', 'placeholder?': 'string', 'disabled?': 'boolean', 'error?': 'boolean' },
  },
  Badge: {
    props: { label: 'string', tone: ['info', 'success', 'warning', 'danger'] },
  },
})

// Simple config: pass the catalog — the recommended preset is the default.
const graph = await createAtlas({ plugins: [catalog] }).build()

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
