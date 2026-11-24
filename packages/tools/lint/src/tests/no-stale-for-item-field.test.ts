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

/** The toggle write plus a `<For>` keyed by `by`, whose row reads `t.done`. */
const keyed = (by: string, extra = '') => `
const todos = signal<Todo[]>([])
${TOGGLE}
${extra}
export const List = () => (
  <ul>
    <For each={todos} by={${by}}>
      {(t) => <li class={t.done ? 'done' : ''}>{t.id}</li>}
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
  // `by` keys that read some fields: only those are safe (#4798).
  ['composite key without the read field', keyed('(t) => `${t.id}:${t.title}`'), 1],
  ['destructured key without the read field', keyed('({ id }) => id'), 1],
  ['same-file key function without the read field', keyed('keyOf', 'const keyOf = (t) => String(t.id)'), 1],
  ['same-file key function declaration without the read field', keyed('keyOf', 'function keyOf(t) { return t.id }'), 1],
  // ── quiet ──────────────────────────────────────────────────────────────
  // A field the `by` key reads changes the key, so the row is rebuilt (#4798).
  ['composite template key', keyed('(t) => `${t.id}:${t.done}`'), 0],
  ['concatenated key', keyed("(t) => t.id + ':' + t.done"), 0],
  ['array join key', keyed("(t) => [t.id, t.done].join(':')"), 0],
  ['wrapped and optional key reads', keyed('(t) => `${(t as Todo).id}:${t!.done}:${t?.title}`'), 0],
  ['element-access key', keyed("(t) => `${t['id']}:${t['done']}`"), 0],
  ['block-bodied key', keyed("(t) => { const d = t.done ? 'd' : 'o'; return t.id + d }"), 0],
  ['destructured key param', keyed('({ id, done }) => `${id}:${done}`'), 0],
  ['same-file key function', keyed('keyOf', 'const keyOf = (t) => `${t.id}:${t.done}`'), 0],
  ['key helper that sees the whole item', keyed('(t) => keyOf(t)'), 0],
  ['imported key function', keyed('importedKeyOf'), 0],
  ['the item itself as the key', keyed('(t) => t'), 0],
  ['key built by a call', keyed("keyBy('id', 'done')"), 0],
  [
    'member-chain key covers its top-level field',
    `const todos = signal([])\nconst bump = (id) => todos.set(todos().map((t) => (t.id === id ? { ...t, meta: { rev: t.meta.rev + 1 } } : t)))\nexport const L = () => <For each={todos} by={(t) => \`\${t.id}:\${t.meta.rev}\`}>{(t) => <li>{t.meta.rev}</li>}</For>`,
    0,
  ],
  [
    'the #4798 repro',
    `import { For } from '@pyreon/core'\nimport { signal } from '@pyreon/reactivity'\ntype Row = { id: string; done: boolean }\nexport function List() {\n  const rows = signal<Row[]>([{ id: 'a', done: false }])\n  const toggle = (id: string) => rows.set(rows().map((r) => (r.id === id ? { ...r, done: !r.done } : r)))\n  return (\n    <ul>\n      <For each={rows} by={(r) => \`\${r.id}:\${r.done}\`}>\n        {(r) => <li class={r.done ? 'done' : ''} onClick={() => toggle(r.id)}>{r.id}</li>}\n      </For>\n    </ul>\n  )\n}`,
    0,
  ],
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
    const src = readFileSync(resolve(here, '../../../../../examples/native-todomvc/src/TodoApp.tsx'), 'utf8')
    expect(lintHits(src, 'examples/native-todomvc/src/TodoApp.tsx')).toEqual([])
    expect(detectorHits(src)).toEqual([])
  })
})
