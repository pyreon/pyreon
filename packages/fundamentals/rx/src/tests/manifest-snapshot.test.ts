import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — rx snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/rx — Signal-aware reactive transforms — filter, map, sortBy, groupBy, pipe, debounce, throttle, 37 functions. Functions detect signals by checking for a \`.subscribe\` method. Pass the signal itself (\`items\`), not an accessor wrapper (\`() => items()\`). Accessor wrappers produce a static result."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/rx — Reactive Transforms

      Signal-aware reactive data transforms for Pyreon. Every function is overloaded: pass a \`Signal<T[]>\` and get a \`Computed<T[]>\` that auto-tracks and re-derives when the source changes; pass a plain \`T[]\` and get a static result. 37 functions across collections (filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample), aggregation (count, sum, min, max, average, reduce, every, some), operators (distinct, scan, combine, zip, merge), timing (debounce, throttle), and search. \`pipe(source, ...ops)\` composes transforms left-to-right. Also exported as a namespaced \`rx\` object for dot-notation usage.

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
      const byDept = rx.groupBy(users, u => u.department)      // Computed<Map<string, User[]>>

      // Pipe — compose left-to-right:
      const result = pipe(
        users,
        filter(u => u.active),
        sortBy('name'),
        map(u => u.name),
      )  // Computed<string[]> → ["Alice", "Charlie"]

      // Search — fuzzy text matching across fields:
      const query = signal('')
      const matches = search(users, query, { keys: ['name', 'department'] })

      // Timing — debounce/throttle signal emissions:
      const debounced = debounce(users, 300)    // Computed that settles after 300ms
      const throttled = rx.throttle(users, 100) // Computed that emits at most every 100ms

      // Plain input → plain output (no signals):
      const staticResult = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]
      \`\`\`

      > **Signal detection**: Functions detect signals by checking for a \`.subscribe\` method. Pass the signal itself (\`items\`), not an accessor wrapper (\`() => items()\`). Accessor wrappers produce a static result.
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
    expect(Object.keys(record).length).toBe(3)
    expect(record['rx/rx']!.notes).toContain('Signal')
    expect(record['rx/rx']!.mistakes?.split('\n').length).toBe(2)
  })
})
