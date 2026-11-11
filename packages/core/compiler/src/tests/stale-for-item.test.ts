import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectPyreonPatterns, hasPyreonPatterns } from '../pyreon-intercept'

/**
 * `for-stale-item-field` (#4468): a keyed `<For>` row that reads a field of an
 * item the same file replaces under its key. Both halves must be present: the
 * read alone is fine when items never change identity.
 */

const CODE = 'for-stale-item-field'
const hits = (code: string) => detectPyreonPatterns(code).filter((d) => d.code === CODE)

const TOGGLE = `const toggle = (id: number) => todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))`

const list = (row: string, extra = '') => `
import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
type Todo = { id: number; title: string; done: boolean }
const todos = signal<Todo[]>([])
${TOGGLE}
${extra}
export const List = () => (
  <ul>
    <For each={todos} by={(t) => t.id}>
      {${row}}
    </For>
  </ul>
)
`

describe('for-stale-item-field — fires when a replaced field is read in a keyed row', () => {
  it('a text-child read (the native-tasks shape)', () => {
    const d = hits(list(`(t) => <li>{t.done ? 'done' : 'todo'}</li>`))
    expect(d).toHaveLength(1)
    expect(d[0]!.current).toBe('t.done')
    expect(d[0]!.message).toContain('`t.done`')
    expect(d[0]!.message).toContain('FIRST value')
    expect(d[0]!.suggested).toContain('liveDone(t.id)')
    expect(d[0]!.fixable).toBe(false)
  })

  it('an attribute read (the playground TodoList shape)', () => {
    const d = hits(list(`(t) => <li class={t.done ? 'done' : ''}>{t.title}</li>`))
    expect(d.map((x) => x.current)).toEqual(['t.done'])
  })

  it('the whole item passed to a same-file component that reads the field (the todomvc shape)', () => {
    const code = list(
      `(t) => <Row todo={t} onToggle={() => toggle(t.id)} />`,
      `function Row(props: { todo: Todo; onToggle: () => void }) {
         return <label><input type="checkbox" checked={props.todo.done} onChange={props.onToggle} />{props.todo.title}</label>
       }`,
    )
    const d = hits(code)
    expect(d).toHaveLength(1)
    expect(d[0]!.current).toBe('todo={t}')
    expect(d[0]!.message).toContain('<Row>')
    expect(d[0]!.message).toContain('`done`')
  })

  it('a destructuring child component and a spread item', () => {
    const extra = `const Row = ({ todo }: { todo: Todo }) => <i>{todo.done ? 'y' : 'n'}</i>
       const Cell = (props: Todo) => <b>{props.done ? 'y' : 'n'}</b>`
    expect(hits(list(`(t) => <Row todo={t} />`, extra))).toHaveLength(1)
    expect(hits(list(`(t) => <Cell {...t} />`, extra))).toHaveLength(1)
  })

  it('a destructured row param', () => {
    const d = hits(list(`({ id, done }) => <li data-id={id}>{done ? 'y' : 'n'}</li>`))
    expect(d).toHaveLength(1)
    expect(d[0]!.message).toContain('destructures `done`')
  })

  it('a stale read inside a handler is the same bug (it writes the old value back)', () => {
    const d = hits(list(`(t) => <button onClick={() => save(t.id, !t.done)}>x</button>`))
    expect(d.map((x) => x.current)).toEqual(['t.done'])
  })

  it.each([
    ['update + map with a block body', `todos.update((xs) => xs.map((x) => { if (x.id !== 1) return x; return { ...x, done: true } }))`],
    ['.with', `todos.set(todos().with(0, { ...todos()[0], done: true }))`],
    ['splice', `const xs = todos().slice(); xs.splice(0, 1, { ...xs[0], done: true }); todos.set(xs)`],
    ['index assignment', `const xs = todos().slice(); xs[0] = { ...xs[0], done: true }; todos.set(xs)`],
    ['an unconditional decorating map in a computed', `const rows = computed(() => todos().map((x) => ({ ...x, done: x.title === sel() })))`],
  ])('replacement shape: %s', (_name, write) => {
    const code = `
      const todos = signal<Todo[]>([])
      ${write}
      export const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>
    `
    expect(hits(code)).toHaveLength(1)
  })

  it('a spread of an unknown patch makes every non-key field stale', () => {
    const code = `
      const todos = signal<Todo[]>([])
      const patch = (id, p) => todos.set(todos().map((t) => (t.id === id ? { ...t, ...p } : t)))
      export const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li data-id={t.id}>{t.title}</li>}</For>
    `
    expect(hits(code).map((d) => d.current)).toEqual(['t.title'])
  })

  it('an accessor that passes the signal itself still keeps its rows', () => {
    const code = `
      const todos = signal<Todo[]>([])
      ${TOGGLE}
      export const L = () => <div>{() => ready() ? <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For> : null}</div>
    `
    expect(hits(code)).toHaveLength(1)
  })

  it('an inner <For> in an outer row callback is not an accessor', () => {
    const code = `
      const todos = signal<Todo[]>([])
      ${TOGGLE}
      export const L = () => (
        <For each={groups} by={(g) => g.id}>
          {(g) => <For each={todos()} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>}
        </For>
      )
    `
    expect(hits(code)).toHaveLength(1)
  })

  it('the shipped examples before the #4469 fix', () => {
    // native-tasks, as it was: the store accessor is the `each`, the write
    // lives in a handler of the same component.
    const code = `
      function TasksPage() {
        const toggle = (id: number) =>
          useApp().store.tasks.set(useApp().store.tasks().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
        return (
          <For each={useApp().store.tasks} by={(t) => t.id}>
            {(t) => (
              <Inline gap={2}>
                <Button onPress={() => toggle(t.id)}>{t.done ? 'done' : 'todo'}</Button>
                <Text>{t.title}</Text>
              </Inline>
            )}
          </For>
        )
      }
    `
    expect(hits(code).map((d) => d.current)).toEqual(['t.done'])
  })
})

describe('for-stale-item-field — stays quiet', () => {
  it('per-item signals (the tutorial shape)', () => {
    const code = `
      const todos = signal<{ id: number; title: string; done: Signal<boolean> }[]>([])
      const rename = (id, title) => todos.set(todos().map((t) => (t.id === id ? { ...t, title } : t)))
      export const L = () => (
        <For each={todos} by={(t) => t.id}>
          {(t) => <li onClick={() => t.done.set(!t.done())}>{t.done() ? 'y' : 'n'}</li>}
        </For>
      )
    `
    expect(hits(code)).toEqual([])
  })

  it('a list that is never replaced under its key (add / remove only)', () => {
    const code = `
      const todos = signal<Todo[]>([])
      const add = (title) => todos.set([...todos(), { id: Date.now(), title, done: false }])
      const remove = (id) => todos.set(todos().filter((t) => t.id !== id))
      export const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>
    `
    expect(hits(code)).toEqual([])
  })

  it('a read by key through a call, plain or in an accessor (the #4469 fix)', () => {
    const extra = `const isDone = (id: number) => todos().some((x) => x.id === id && x.done)`
    expect(hits(list(`(t) => <li class={isDone(t.id) ? 'done' : ''}>{isDone(t.id) ? 'y' : 'n'}</li>`, extra))).toEqual([])
    expect(hits(list(`(t) => <li>{() => (isDone(t.id) ? 'y' : 'n')}</li>`, extra))).toEqual([])
  })

  it('the key field, and fields the replacement does not override', () => {
    expect(hits(list(`(t) => <li data-id={t.id}>{t.title}</li>`))).toEqual([])
  })

  it('a non-keyed .map() in JSX, and a <For> without `by`', () => {
    const code = `
      const todos = signal<Todo[]>([])
      ${TOGGLE}
      export const A = () => <ul>{todos().map((t) => <li>{t.done ? 'y' : 'n'}</li>)}</ul>
    `
    expect(hits(code)).toEqual([])
  })

  it('a nested callback that rebinds the item name', () => {
    expect(hits(list(`(t) => <Picker onPick={(t) => use(t.done)}>{t.title}</Picker>`))).toEqual([])
  })

  it('a same-file component that does not read the replaced field', () => {
    const code = list(`(t) => <Row todo={t} />`, `function Row(props) { return <b>{props.todo.title}</b> }`)
    expect(hits(code)).toEqual([])
  })

  it('an imported component (its reads are not visible here)', () => {
    expect(hits(list(`(t) => <ImportedRow todo={t} />`))).toEqual([])
  })

  it('a <For> rebuilt by an accessor that reads the list eagerly (the FeatureDemo shape)', () => {
    // The accessor reads `list.data()` while building the <For>, so every
    // list change re-runs it and remounts the rows: they are always fresh.
    // Measured: the playground's Feature demo row style follows a PUT.
    const code = `
      const tasks = signal<Todo[]>([])
      const put = (id, body) => tasks.set(tasks().map((t) => (t.id === id ? { ...t, ...body, id } : t)))
      export const L = () => (
        <div>
          {() => list.isLoading() ? <p>Loading</p> : (
            <ul><For each={list.data() ?? []} by={(t) => t.id}>{(task) => <li>{task.done ? 'y' : 'n'}</li>}</For></ul>
          )}
        </div>
      )
    `
    expect(hits(code)).toEqual([])
  })

  it('is reached through the pre-filter', () => {
    expect(hasPyreonPatterns(list(`(t) => <li>{t.done}</li>`))).toBe(true)
  })
})

describe('for-stale-item-field — the shipped native-todomvc source', () => {
  const HERE = dirname(fileURLToPath(import.meta.url))
  const SRC = resolve(HERE, '../../../../../examples/native-todomvc-ios/src/TodoApp.tsx')

  it('is clean (the row reads the live value by id)', () => {
    expect(hits(readFileSync(SRC, 'utf8'))).toEqual([])
  })
})
