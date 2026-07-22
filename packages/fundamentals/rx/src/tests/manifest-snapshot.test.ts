import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — rx snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/rx — Signal-aware reactive transforms — filter, map, flatMap, sortBy, groupBy, countBy, pipe, debounce, throttle, 42 functions. Detection is purely \`typeof source === "function"\` (see \`isSignal\` in \`rx/src/types.ts\`) — there is NO \`.subscribe\` / value inspection. Any function (the signal, an accessor wrapper \`() => items()\`, a bound method) is treated as reactive and called inside a computed. The actual mistake is the opposite of what you might expect: passing a RESOLVED value (\`items()\`, an already-read array) takes the static path and never updates. Pass the signal, not its resolved value."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/rx — Reactive Transforms

      Signal-aware reactive data transforms for Pyreon. Every collection/aggregation function is overloaded: pass a \`Signal<T[]>\` and get a \`Computed<T[]>\` that auto-tracks and re-derives when the source changes; pass a plain \`T[]\` and get a static result. Signal detection is purely \`typeof source === "function"\` — any function is treated as a reactive source and called inside a computed; a resolved value (already-called signal) takes the static path and never updates. 42 functions across collections (filter, map, flatMap, sortBy — with an asc/desc direction param —, groupBy, countBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample, intersection, difference, union — the set ops are signal-aware on BOTH inputs), aggregation (count, sum, min, max, average, reduce, every, some), operators (distinct, scan, combine, zip, merge), timing (debounce, throttle), and search. \`pipe(source, ...ops)\` collapses a chain into ONE computed (vs N computeds for N separate calls). Also exported as a namespaced \`rx\` object for dot-notation usage.

      \`\`\`typescript
      import { signal, effect } from '@pyreon/reactivity'
      import { rx, pipe, filter, sortBy, map, flatMap, groupBy, countBy, take, sum, debounce, search } from '@pyreon/rx'

      interface User {
        name: string
        age: number
        department: string
        tags: string[]
        active: boolean
      }

      const users = signal<User[]>([
        { name: 'Alice', age: 30, department: 'eng', tags: ['ts', 'rust'], active: true },
        { name: 'Bob', age: 25, department: 'eng', tags: ['go'], active: false },
        { name: 'Charlie', age: 35, department: 'design', tags: ['css'], active: true },
      ])

      // Signal input → Computed output (auto-tracks):
      const activeUsers = rx.filter(users, u => u.active)     // Computed<User[]>
      const sorted = rx.sortBy(activeUsers, 'name')            // Computed<User[]>
      const top5 = rx.take(sorted, 5)                          // Computed<User[]>

      // Aggregation:
      const totalAge = rx.sum(users, u => u.age)               // Computed<number>
      const headcount = rx.count(activeUsers)                  // Computed<number>

      // Grouping and counting:
      const byDept = rx.groupBy(users, u => u.department)      // Computed<Record<string, User[]>>
      const perDept = rx.countBy(users, u => u.department)     // Computed<Record<string, number>>
      const allTags = rx.flatMap(users, u => u.tags)           // Computed<string[]> (map + flatten)

      // Pipe — thread the value through plain transform functions, left-to-right.
      // Each fn receives the resolved value; the rx helpers are 2-arg (source, ...),
      // so wrap them: us => filter(us, pred). There is NO curried filter(pred) form.
      // The whole chain is ONE computed — one recompute per source change, not N.
      const result = pipe(
        users,
        us => filter(us, u => u.active),
        us => sortBy(us, 'name'),
        us => map(us, u => u.name),
      )  // Computed<string[]> → ["Alice", "Charlie"]

      // Search — case-insensitive substring match across STRING fields.
      // 3rd arg is a positional keys array, NOT a { keys } options object.
      const query = signal('')
      const matches = search(users, query, ['name', 'department'])

      // Timing — debounce/throttle a SIGNAL value (returns ReadableSignal + dispose;
      // value-level, not collection operators). Auto-torn-down inside a component /
      // effectScope; call dispose() for standalone usage:
      const debounced = debounce(query, 300)     // ReadableSignal<string> & { dispose }
      const throttled = rx.throttle(query, 100)  // ReadableSignal<string> & { dispose }
      effect(() => matches())

      // Plain input → plain output (no signals):
      const staticResult = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]
      \`\`\`

      > **Signal detection**: Detection is purely \`typeof source === "function"\` (see \`isSignal\` in \`rx/src/types.ts\`) — there is NO \`.subscribe\` / value inspection. Any function (the signal, an accessor wrapper \`() => items()\`, a bound method) is treated as reactive and called inside a computed. The actual mistake is the opposite of what you might expect: passing a RESOLVED value (\`items()\`, an already-read array) takes the static path and never updates. Pass the signal, not its resolved value.
      >
      > **pipe collapses N computeds into ONE**: \`pipe(source, ...fns)\` builds a SINGLE computed that runs the whole chain — one recompute per source change, ~1 computed node retained (~913 B). Chaining N separate rx calls (\`const a = filter(src,…); const b = sortBy(a,…); …\`) builds N computed nodes: N intermediate subscriptions, N dirty-propagation hops per change, ~N×913 B. For any chain longer than 2 steps, prefer \`pipe\`. (Reproduce the exact node/recompute counts with \`bun run --filter=@pyreon/rx bench\`.)
      >
      > **Timing operators are scope-aware**: \`debounce\`/\`throttle\`/\`distinct\`/\`scan\` create an eager \`effect()\`. Created inside a component or \`effectScope\`, that effect (and any pending timer for debounce/throttle) is torn down automatically on unmount. Created STANDALONE (module scope, a \`defineStore\` setup that outlives every scope), nothing owns it — call the returned \`.dispose()\`. All four expose an idempotent \`.dispose()\`. A growing \`rx.debounce.create\` / \`rx.throttle.create\` perf counter in dev flags standalone instances created without a matching dispose.
      >
      > **Computed lifecycle**: Computed outputs from signal inputs auto-dispose when they have no subscribers. In component bodies, the reactive scope from JSX keeps them alive; in standalone code, subscribe or read within an \`effect()\` to keep them active.
      >
      > **No curried operators — pipe takes plain transforms**: rx functions are NOT curried — every collection/aggregation helper is \`(source, …args)\` only. \`pipe(source, ...fns)\` threads the value through plain \`(value) => value\` functions, so to use a helper inside a pipe you wrap it: \`pipe(users, us => filter(us, pred), us => map(us, fn))\`. A lone \`filter(pred)\` is not a valid call.
      >
      > **Tree-shaking**: The \`rx\` namespace object is a \`const\` — bundlers can tree-shake unused properties. For maximum control, import individual functions: \`import { filter, map } from "@pyreon/rx"\`.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    // Enriched to MCP density: rx, pipe, filter, map, flatMap, sortBy,
    // groupBy, countBy, search, debounce, throttle = 11.
    expect(Object.keys(record).length).toBe(11)
    expect(record['rx/rx']!.notes).toContain('Signal')
    expect(record['rx/rx']!.mistakes?.split('\n').length).toBe(4)
    // Regression guard: the 4 corrected inaccuracies must NOT reappear.
    // groupBy must say Record, not claim a Map return type.
    expect(record['rx/groupBy']!.notes).toContain('Record')
    expect(record['rx/groupBy']!.notes).not.toContain('`Map<')
    // search must document the positional keys arg.
    expect(record['rx/search']!.notes).toContain('POSITIONAL')
    // The rx-entry summary must not resurrect the false `.subscribe` claim.
    expect(record['rx/rx']!.notes).not.toContain('.subscribe')
  })
})
