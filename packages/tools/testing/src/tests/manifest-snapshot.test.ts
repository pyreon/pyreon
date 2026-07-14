import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — @pyreon/testing snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/testing — Testing-Library-compatible test kit for Pyreon — render/cleanup/renderHook + the full @testing-library/dom surface + reactive-graph matchers (peer: @pyreon/runtime-dom, @pyreon/reactivity). The main \`@pyreon/testing\` entry does NOT auto-register \`afterEach(cleanup)\`. Add \`@pyreon/testing/vitest\` to your vitest \`setupFiles\` to wire auto-cleanup AND extend \`expect\` with jest-dom matchers; otherwise call \`cleanup()\` manually in \`afterEach\`."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/testing — Testing

      The official test kit for Pyreon — a thin adapter over \`@testing-library/dom\` (the shared foundation under React/Vue/Solid/Svelte Testing Library), so the whole Testing-Library API you already know works verbatim, PLUS Pyreon-native additions. Pyreon-native: \`render\` (mounts a Pyreon VNode via \`@pyreon/runtime-dom\`), \`cleanup\`, \`renderHook\`, and REACTIVE-GRAPH matchers (\`expectSignal\` / \`expectEffect\` / \`expectGarbageCollected\` / \`expectNoReactiveLeak\`) that read Pyreon's fine-grained reactive graph to assert things no DOM-only testing library can express (fire counts, effect re-runs, retained-node leaks). Re-exported verbatim from \`@testing-library/dom\`: \`screen\`, \`fireEvent\`, \`waitFor\`, \`within\`, every \`getBy*\`/\`queryBy*\`/\`findBy*\` query, \`prettyDOM\`, \`configure\`, etc. — with the ecosystem's battle-tested ARIA + accessible-name edge-case handling. Distinct from the PRIVATE framework-internal \`@pyreon/test-utils\`.

      \`\`\`typescript
      import { render, screen, fireEvent, cleanup } from '@pyreon/testing'
      import { signal } from '@pyreon/reactivity'

      // Testing-Library API works exactly as you know it:
      test('counter increments', () => {
        render(<Counter />)
        fireEvent.click(screen.getByRole('button', { name: 'Increment' }))
        expect(screen.getByText('Count: 1')).toBeInTheDocument()
      })

      // Auto-cleanup: add '@pyreon/testing/vitest' to vitest setupFiles,
      // or call cleanup() yourself in afterEach.
      afterEach(cleanup)

      // Reactive-graph matchers — assertions a DOM-only library cannot make:
      import { expectSignal, expectEffect, expectNoReactiveLeak } from '@pyreon/testing'
      import { computed, effect } from '@pyreon/reactivity'

      test('computed recomputes exactly once per change', () => {
        const qty = signal(1)
        const total = computed(() => qty() * 10)
        total() // materialize
        qty.set(2)
        expectSignal(total).toHaveRecomputedTimes(1)  // no thrash
      })

      test('effect re-runs only when its dep changes', () => {
        const a = signal(0), b = signal(0)
        const e = effect(() => { a() })
        expectEffect(e).toReRunWhen(() => a.set(1))
        expectEffect(e).notToReRunWhen(() => b.set(1))
      })
      \`\`\`

      > **Peer deps**: @pyreon/runtime-dom, @pyreon/reactivity
      >
      > **Auto-cleanup needs the /vitest setup entry**: The main \`@pyreon/testing\` entry does NOT auto-register \`afterEach(cleanup)\`. Add \`@pyreon/testing/vitest\` to your vitest \`setupFiles\` to wire auto-cleanup AND extend \`expect\` with jest-dom matchers; otherwise call \`cleanup()\` manually in \`afterEach\`.
      >
      > **Queries resolve from baseElement, not container**: \`render()\` binds the query set to \`baseElement\` (\`document.body\`), so Portal/Overlay/Modal content mounted outside the returned \`container\` is still findable (matches @testing-library/react). For container-scoped assertions, use \`within(result.container)\`.
      >
      > **Reactive matchers are dev/test-only**: \`expectSignal\` / \`expectEffect\` read Pyreon's reactive graph, which is tree-shaken out under \`NODE_ENV === "production"\`. They throw on a non-reactive target rather than silently passing. Materialize a lazy computed (call it, or mount a reader) before asserting its fire count.
      >
      > **GC matchers require --expose-gc**: \`expectGarbageCollected\` / \`expectNoReactiveLeak\` need \`globalThis.gc\`. Pass \`execArgv: ["--expose-gc"]\` to your vitest pool; without it both throw an actionable error (never a false pass). Both are async — always \`await\` them.
      >
      > **Distinct from @pyreon/test-utils**: \`@pyreon/testing\` is the PUBLIC test kit. \`@pyreon/test-utils\` is a PRIVATE framework-internal package (initTestConfig, accessInternal, mountReactive, …) — not for app tests.
      "
    `)
  })

  it('renders to MCP api-reference entries — one per api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(8)
    expect(Object.keys(record)).toContain('testing/render')
    expect(Object.keys(record)).toContain('testing/expectSignal')
    expect(Object.keys(record)).toContain('testing/expectNoReactiveLeak')
    expect(record['testing/render']!.notes).toContain('mount')
  })
})
