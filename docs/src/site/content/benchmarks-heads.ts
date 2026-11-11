/**
 * Section heads for `/benchmarks`. The content file (`pages/benchmarks.json`)
 * carries every dataset but no section heads except the losses, harness-bug
 * and reproduce sections, so these come from the design canvas
 * (`project/benchmarks.html`, pulled 11 Nov 2026), word for word, with two
 * edits: figures the content set does not carry (the retained-heap line, the
 * renderToString ratios) are left out, because every number on the page must
 * come from the content file. Move these into the content set when it grows
 * section heads; then delete this file.
 */
export const BENCH_HEADS = {
  hero: {
    eyebrow: 'Benchmarks',
    title: 'Measured in the open. Losses included.',
    lede: "Every number on every Pyreon page comes from this record: real Chromium, production builds, 95% confidence intervals and a correctness check before anything is timed. We call it a win only when it wins every run. When we lose, it's on this page.",
  },
  method: {
    label: 'method',
    title: 'How we measure.',
    text: "Synthetic benchmarks can't predict your app. They can be run honestly. Apple M3 Max, Chromium 156, Node 26 (V8) and Bun 1.4 (JavaScriptCore).",
  },
  rows: {
    label: 'dom · 10 frameworks · real chromium',
    title: 'The row board: level with the fastest, 2.6× ahead of React.',
    text: 'The classic keyed-table benchmark against nine other implementations, including hand-written vanilla JS. Pick an operation. Run 1 shown; verdicts cover both runs.',
  },
  scenarios: {
    label: 'scenarios · real chromium',
    title: 'Real component shapes, not just rows.',
    text: 'Deep trees, context fan-out, effect lists, memo walls and hydration. Two runs each unless marked.',
  },
  scaling: {
    label: 'scaling · 100 → 20,000 rows',
    title: "Select stays flat. Everyone else's doesn't.",
    text: "The same operations at five sizes, batch-timed. Solid's select grows with the row count; Pyreon's is O(1) and twice as fast as Octane's. One run.",
  },
  ssr: {
    label: 'server rendering',
    title: 'The fastest server render we measured, at every size.',
    text: 'Compiled SSR, idiomatic per framework, µs per render (overnight run).',
  },
  apps: {
    label: 'real-app shapes',
    title: 'Forms and to-do lists, the apps people actually build.',
    text: 'A 12-field form against six form libraries, and TodoMVC against React 19. One run each.',
  },
  bundle: {
    label: 'bundle size · same app · gzip -9',
    title: 'Bigger than Solid. Smaller than Vue and React.',
    text: "The same keyed-table app built with each framework. This is a loss and we're not hiding it: Solid, Preact and Svelte ship less.",
  },
  reactivity: {
    label: 'reactivity core · ns/op',
    title: 'Signals, measured on two engines.',
    text: 'Pyreon vs Preact Signals and Solid. Two runs per engine. Pyreon wins propagation and batching, loses creation and deep unobserved chains.',
  },
  products: {
    label: 'every product',
    title: 'Head-to-head, product by product.',
    text: "Each card links to the benchmark section on that product's page.",
  },
  withdrawn: {
    label: 'withdrawn claims',
    title: 'We retract our own numbers.',
    text: "When a harness bug turns up or a result doesn't reproduce, the claim comes down, including claims in our favour.",
  },
} as const
