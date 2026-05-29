import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — rx snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(
      `"- @pyreon/rx — Signal-aware reactive transforms — filter, map, sortBy, groupBy, pipe, debounce, throttle, 37 functions. Detection is purely \`typeof source === "function"\` (see \`isSignal\` in \`rx/src/types.ts\`) — there is NO \`.subscribe\` / value inspection. Any function (the signal, an accessor wrapper \`() => items()\`, a bound method) is treated as reactive and called inside a computed. The actual mistake is the opposite of what you might expect: passing a RESOLVED value (\`items()\`, an already-read array) takes the static path and never updates. Pass the signal, not its resolved value."`,
    )
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/rx — Reactive Transforms

      Signal-aware reactive data transforms for Pyreon. Every collection/aggregation function is overloaded: pass a \`Signal<T[]>\` and get a \`Computed<T[]>\` that auto-tracks and re-derives when the source changes; pass a plain \`T[]\` and get a static result. Signal detection is purely \`typeof source === "function"\` — any function is treated as a reactive source and called inside a computed; a resolved value (already-called signal) takes the static path and never updates. 37 functions across collections (filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample), aggregation (count, sum, min, max, average, reduce, every, some), operators (distinct, scan, combine, zip, merge), timing (debounce, throttle), and search. \`pipe(source, ...ops)\` composes transforms left-to-right. Also exported as a namespaced \`rx\` object for dot-notation usage.

      \`\`\`typescript
      import { signal } from '@pyreon/reactivity'
      import { rx, pipe, filter, sortBy, map, groupBy, take, sum, debounce, search } from '@pyreon/rx'

      interface User {
        name: string
        age: number
        department: string
        active: boolean
      }

      const users = signal<User[]>([
        { name: 'Alice', age: 30, department: 'eng', active: true },
        { name: 'Bob', age: 25, department: 'eng', active: false },
        { name: 'Charlie', age: 35, department: 'design', active: true },
      ])

      // Signal input → Computed output (auto-tracks):
      const activeUsers = rx.filter(users, u => u.active)     // Computed<User[]>
      const sorted = rx.sortBy(activeUsers, 'name')            // Computed<User[]>
      const top5 = rx.take(sorted, 5)                          // Computed<User[]>

      // Aggregation:
      const totalAge = rx.sum(users, u => u.age)               // Computed<number>
      const count = rx.count(activeUsers)                       // Computed<number>

      // Grouping:
      const byDept = rx.groupBy(users, u => u.department)      // Computed<Record<string, User[]>>

      // Pipe — compose left-to-right:
      const result = pipe(
        users,
        filter(u => u.active),
        sortBy('name'),
        map(u => u.name),
      )  // Computed<string[]> → ["Alice", "Charlie"]

      // Search — case-insensitive substring match across STRING fields.
      // 3rd arg is a positional keys array, NOT a { keys } options object.
      const query = signal('')
      const matches = search(users, query, ['name', 'department'])

      // Timing — debounce/throttle a SIGNAL value (returns ReadableSignal +
      // dispose; value-level, not collection operators; NOT auto-cleaned):
      const debounced = debounce(users, 300)    // ReadableSignal<User[]> & { dispose }
      const throttled = rx.throttle(users, 100) // ReadableSignal<User[]> & { dispose }

      // Plain input → plain output (no signals):
      const staticResult = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]
      \`\`\`

      > **Signal detection**: Detection is purely \`typeof source === "function"\` (see \`isSignal\` in \`rx/src/types.ts\`) — there is NO \`.subscribe\` / value inspection. Any function (the signal, an accessor wrapper \`() => items()\`, a bound method) is treated as reactive and called inside a computed. The actual mistake is the opposite of what you might expect: passing a RESOLVED value (\`items()\`, an already-read array) takes the static path and never updates. Pass the signal, not its resolved value.
      >
      > **Computed lifecycle**: Computed outputs from signal inputs auto-dispose when they have no subscribers. In component bodies, the reactive scope from JSX keeps them alive; in standalone code, subscribe or read within an \`effect()\` to keep them active.
      >
      > **Curried vs uncurried**: Every function has both a direct form \`filter(source, pred)\` and a curried form \`filter(pred)\` for use with \`pipe()\`. The curried form is detected by argument count.
      >
      > **Tree-shaking**: The \`rx\` namespace object is a \`const\` — bundlers can tree-shake unused properties. For maximum control, import individual functions: \`import { filter, map } from "@pyreon/rx"\`.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    // Enriched to MCP density (manifest-depth PR): rx, pipe, filter,
    // map, sortBy, groupBy, search, debounce, throttle = 9.
    expect(Object.keys(record).length).toBe(9)
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
