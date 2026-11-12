/**
 * `pyreon/no-stale-for-item-field` (#4468) — a keyed `<For>` row reading a
 * field of an item the same file replaces under its key. On the web the row
 * runs once per key and keeps the first value; iOS/Android redraw the row.
 *
 * Every case also runs through `detectPyreonPatterns` (`for-stale-item-field`),
 * the compiler-side mirror that feeds `pyreon check`, MCP `validate` and the
 * Reactivity Lens: the two walk different ASTs (oxc vs TypeScript), so the
 * table below is what keeps them reporting the same thing.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectPyreonPatterns } from '@pyreon/compiler/analyze'
import { noStaleForItemField } from '../rules/reactivity/no-stale-for-item-field'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const ID = 'pyreon/no-stale-for-item-field'
const ON: LintConfig = { rules: { [ID]: 'error' } }
const lintHits = (code: string, file = 'src/App.tsx') =>
  lintFile(file, code, [noStaleForItemField], ON).diagnostics.filter((d) => d.ruleId === ID)
const detectorHits = (code: string) =>
  detectPyreonPatterns(code, 'App.tsx').filter((d) => d.code === 'for-stale-item-field')

const TOGGLE = `const toggle = (id: number) => todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))`
const list = (row: string, extra = '') => `
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

const CASES: Array<[name: string, code: string, expected: number]> = [
  // ── fires ──────────────────────────────────────────────────────────────
  ['text child read', list(`(t) => <li>{t.done ? 'done' : 'todo'}</li>`), 1],
  ['class attribute read', list(`(t) => <li class={t.done ? 'done' : ''}>{t.title}</li>`), 1],
  [
    'item passed to a same-file component reading props.todo.done',
    list(`(t) => <Row todo={t} />`, `function Row(props) { return <input type="checkbox" checked={props.todo.done} /> }`),
    1,
  ],
  [
    'item passed to a destructuring component',
    list(`(t) => <Row todo={t} />`, `const Row = ({ todo }) => <i>{todo.done ? 'y' : 'n'}</i>`),
    1,
  ],
  ['item spread onto a component', list(`(t) => <Cell {...t} />`, `const Cell = (props) => <b>{props.done ? 'y' : 'n'}</b>`), 1],
  ['destructured row param', list(`({ id, done }) => <li data-id={id}>{done ? 'y' : 'n'}</li>`), 1],
  ['handler read writes the stale value back', list(`(t) => <button onClick={() => save(t.id, !t.done)}>x</button>`), 1],
  [
    '.with replacement',
    `const todos = signal([])\ntodos.set(todos().with(0, { ...todos()[0], done: true }))\nexport const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>`,
    1,
  ],
  [
    'index assignment replacement',
    `const todos = signal([])\nconst xs = todos().slice(); xs[0] = { ...xs[0], done: true }; todos.set(xs)\nexport const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>`,
    1,
  ],
  [
    'splice replacement',
    `const todos = signal([])\nconst xs = todos().slice(); xs.splice(0, 1, { ...xs[0], done: true }); todos.set(xs)\nexport const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>`,
    1,
  ],
  [
    'unknown patch spread makes every non-key field stale',
    `const todos = signal([])\nconst patch = (id, p) => todos.set(todos().map((t) => (t.id === id ? { ...t, ...p } : t)))\nexport const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li data-id={t.id}>{t.title}</li>}</For>`,
    1,
  ],
  [
    'accessor passing the signal itself keeps its rows',
    `const todos = signal([])\n${TOGGLE}\nexport const L = () => <div>{() => ready() ? <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For> : null}</div>`,
    1,
  ],
  [
    'inner <For> inside an outer row callback',
    `const todos = signal([])\n${TOGGLE}\nexport const L = () => <For each={groups} by={(g) => g.id}>{(g) => <For each={todos()} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>}</For>`,
    1,
  ],
  // ── quiet ──────────────────────────────────────────────────────────────
  [
    'per-item signals',
    `const todos = signal([])\nconst rename = (id, title) => todos.set(todos().map((t) => (t.id === id ? { ...t, title } : t)))\nexport const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li onClick={() => t.done.set(!t.done())}>{t.done() ? 'y' : 'n'}</li>}</For>`,
    0,
  ],
  [
    'list never replaced under its key',
    `const todos = signal([])\nconst add = (title) => todos.set([...todos(), { id: 1, title, done: false }])\nconst remove = (id) => todos.set(todos().filter((t) => t.id !== id))\nexport const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>`,
    0,
  ],
  [
    'read by key through a call, plain and in an accessor',
    list(
      `(t) => <li class={isDone(t.id) ? 'done' : ''}>{() => (isDone(t.id) ? 'y' : 'n')}</li>`,
      `const isDone = (id) => todos().some((x) => x.id === id && x.done)`,
    ),
    0,
  ],
  ['key field and non-replaced fields', list(`(t) => <li data-id={t.id}>{t.title}</li>`), 0],
  ['non-keyed .map() in JSX', `const todos = signal([])\n${TOGGLE}\nexport const A = () => <ul>{todos().map((t) => <li>{t.done ? 'y' : 'n'}</li>)}</ul>`, 0],
  ['<For> without by', `const todos = signal([])\n${TOGGLE}\nexport const A = () => <For each={todos}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>`, 0],
  ['nested callback rebinding the item name', list(`(t) => <Picker onPick={(t) => use(t.done)}>{t.title}</Picker>`), 0],
  ['same-file component reading only non-replaced fields', list(`(t) => <Row todo={t} />`, `function Row(props) { return <b>{props.todo.title}</b> }`), 0],
  ['imported component', list(`(t) => <ImportedRow todo={t} />`), 0],
  [
    '<For> rebuilt by an accessor reading the list eagerly',
    `const tasks = signal([])\nconst put = (id, body) => tasks.set(tasks().map((t) => (t.id === id ? { ...t, ...body, id } : t)))\nexport const L = () => <div>{() => list.isLoading() ? <p /> : <ul><For each={list.data() ?? []} by={(t) => t.id}>{(task) => <li>{task.done ? 'y' : 'n'}</li>}</For></ul>}</div>`,
    0,
  ],
]

describe(ID, () => {
  it.each(CASES)('%s', (_name, code, expected) => {
    expect(lintHits(code)).toHaveLength(expected)
  })

  it.each(CASES)('detector parity: %s', (_name, code, expected) => {
    expect(detectorHits(code)).toHaveLength(expected)
  })

  it('reports at the read and names the field and the fix', () => {
    const code = list(`(t) => <li>{t.done ? 'done' : 'todo'}</li>`)
    const [d] = lintHits(code)
    expect(code.slice(d!.span.start, d!.span.end)).toBe('t.done')
    expect(d!.message).toContain('`t.done`')
    expect(d!.message).toContain('FIRST value')
    expect(d!.message).toContain('isDone(t.id)')
  })

  it('honours exemptPaths', () => {
    const code = list(`(t) => <li>{t.done}</li>`)
    const cfg: LintConfig = { rules: { [ID]: ['error', { exemptPaths: ['native-golden/'] }] } }
    const diags = lintFile('pkg/native-golden/a.tsx', code, [noStaleForItemField], cfg).diagnostics
    expect(diags.filter((d) => d.ruleId === ID)).toEqual([])
  })

  it('the shipped native-todomvc source is clean on both surfaces', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(resolve(here, '../../../../../examples/native-todomvc-ios/src/TodoApp.tsx'), 'utf8')
    expect(lintHits(src, 'examples/native-todomvc-ios/src/TodoApp.tsx')).toEqual([])
    expect(detectorHits(src)).toEqual([])
  })
})
