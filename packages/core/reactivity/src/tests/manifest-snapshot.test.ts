import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import reactivityManifest from '../manifest'

describe('gen-docs — reactivity snapshot', () => {
  it('renders @pyreon/reactivity to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(reactivityManifest)).toMatchInlineSnapshot(`"- @pyreon/reactivity — Fine-grained reactivity: signal, computed, effect, batch, onCleanup, createStore, watch, createResource, untrack. Pyreon signals are NOT \`.value\` getters (Vue ref) or \`[state, setState]\` tuples (React useState). The signal IS the function: \`count()\` reads, \`count.set(v)\` writes, \`count.update(fn)\` derives. This is the #1 confusion for developers coming from other frameworks."`)
  })

  it('renders @pyreon/reactivity to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(reactivityManifest)).toMatchInlineSnapshot(`
      "## @pyreon/reactivity — Complete API

      Standalone reactive primitives — no DOM, no JSX, no framework dependency. Signals are callable functions (\`count()\` to read, \`count.set(5)\` to write, \`count.update(n => n + 1)\` to derive). Subscribers tracked via \`Set<() => void>\`; batch uses pointer swap for zero-allocation grouping. Every other Pyreon package builds on this foundation but \`@pyreon/reactivity\` can be used independently in Node, Bun, or browser scripts without any framework overhead.

      \`\`\`typescript
      import { signal, computed, effect, batch, onCleanup, createStore, watch, untrack } from "@pyreon/reactivity"

      // signal<T>() — callable function, NOT .value getter/setter
      const count = signal(0)
      count()              // read (subscribes)
      count.set(5)         // write
      count.update(n => n + 1)  // derive
      count.peek()         // read WITHOUT subscribing

      // computed<T>() — auto-tracked, memoized
      const doubled = computed(() => count() * 2)

      // effect() — re-runs when dependencies change
      const dispose = effect(() => {
        console.log("Count:", count())
        onCleanup(() => console.log("cleaning up"))
      })

      // batch() — group 3+ writes into a single notification pass
      batch(() => {
        count.set(10)
        count.set(20)  // subscribers fire once, with 20
      })

      // watch(source, callback) — explicit dependency tracking
      watch(() => count(), (next, prev) => {
        console.log(\`changed from \${prev} to \${next}\`)
      })

      // createStore() — deeply reactive object (proxy-based)
      const store = createStore({ todos: [{ text: 'Learn Pyreon', done: false }] })
      store.todos[0].done = true  // fine-grained update, no immer needed

      // untrack() — read signals without subscribing
      effect(() => {
        const current = count()
        const other = untrack(() => otherSignal())  // won't re-run when otherSignal changes
      })
      \`\`\`

      > **Signals are callable functions**: Pyreon signals are NOT \`.value\` getters (Vue ref) or \`[state, setState]\` tuples (React useState). The signal IS the function: \`count()\` reads, \`count.set(v)\` writes, \`count.update(fn)\` derives. This is the #1 confusion for developers coming from other frameworks.
      >
      > **No dependency arrays**: \`effect()\` and \`computed()\` auto-track dependencies on each execution — no \`[dep1, dep2]\` array needed. Every signal read inside the body is a tracked dependency. This means conditional reads (\`if (cond()) { return x() }\`) only track \`x\` when \`cond()\` is true.
      >
      > **Standalone**: \`@pyreon/reactivity\` has zero dependencies. Use it in Node/Bun scripts, edge workers, or any JavaScript environment without pulling in the rest of the framework. \`@pyreon/core\` and \`@pyreon/runtime-dom\` build on it but are not required.
      "
    `)
  })

  it('renders @pyreon/reactivity to MCP api-reference entries — one per api[] item', () => {
    const record = renderApiReferenceEntries(reactivityManifest)
    expect(Object.keys(record).length).toBe(8)
    expect(Object.keys(record)).toContain('reactivity/signal')
    // Spot-check the flagship API — signal is the core primitive
    const signal = record['reactivity/signal']!
    expect(signal.mistakes?.split('\n').length).toBe(6)
    expect(signal.notes).toContain('CALLABLE FUNCTION')
  })
})
