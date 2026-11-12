import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { applySnapshot, getSnapshot, model, onPatch, onSnapshot } from '@pyreon/state-tree'
import { DemoSurface, GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { DemoGrid, PaperButton } from '../kit/demo'
import { createLog, DemoLog, DemoStack, PaperActions, PaperCheck, PaperList, PaperRow, PaperText } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * State-tree demo (`statetree.json` → demo): a real `model()` list. Each
 * change prints its `onPatch` object as JSON; undo walks back through the
 * `onSnapshot` history with `applySnapshot`; the panel shows `getSnapshot`.
 *
 * The todos are a plain-object array on the list model, changed by actions
 * on the parent, not model instances inside the array: patches for models
 * in arrays are not replayable yet (#4311), and a whole-field `replace`
 * patch always is.
 */
interface Todo {
  id: number
  title: string
  done: boolean
}

const NAMES = ['Record a video', 'Answer issues', 'Benchmark run', 'Update docs']

const TodoList = model({ state: { todos: [] as Todo[] } }).actions((self) => ({
  toggle: (id: number) => self.todos.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
  add: (title: string) => self.todos.update((list) => [...list, { id: (list.at(-1)?.id ?? 0) + 1, title, done: false }]),
}))

export default function DemoStatetree() {
  const list = TodoList.create({
    todos: [
      { id: 1, title: 'Write the spec', done: true },
      { id: 2, title: 'Ship the demo', done: false },
    ],
  })
  const patches = createLog(30)
  const snapshot = signal(JSON.stringify(getSnapshot(list), null, 2))
  const history: string[] = [snapshot.peek()]
  const depth = signal(0)

  onPatch(list, (p) => patches.push(JSON.stringify(p)))
  onSnapshot(list, (snap) => {
    const json = JSON.stringify(snap, null, 2)
    snapshot.set(json)
    // An undo's own snapshot equals the history top: not a new step.
    if (json === history[history.length - 1]) return
    history.push(json)
    depth.set(history.length - 1)
  })

  const undo = () => {
    if (history.length < 2) return
    history.pop()
    depth.set(history.length - 1)
    patches.push('applySnapshot(list, previous)  (undo)', 'accent')
    applySnapshot(list, JSON.parse(history[history.length - 1] as string))
  }

  // Rows are keyed by id and the array is replaced on every change: read the
  // current value by id, never the row's captured object.
  const doneOf = (id: number) => list.todos().find((x) => x.id === id)?.done ?? false
  const left = () => list.todos().filter((t) => !t.done).length

  return (
    <DemoGrid>
      <DemoSurface aria-label="Todo list demo">
        <PaperRow>
          <strong>Todos</strong>
          <PaperText aria-live="polite">{() => `${left()} left`}</PaperText>
        </PaperRow>
        <PaperList aria-label="Todos">
          <For each={() => list.todos()} by={(t) => t.id}>
            {(t) => (
              <li>
                <PaperCheck>
                  <input type="checkbox" checked={() => doneOf(t.id)} onChange={() => list.toggle(t.id)} />
                  <span>{t.title}</span>
                </PaperCheck>
              </li>
            )}
          </For>
        </PaperList>
        <PaperActions>
          <PaperButton type="button" onClick={() => list.add(NAMES[list.todos.peek().length % NAMES.length] as string)}>
            add()
          </PaperButton>
          <PaperButton type="button" onClick={undo} disabled={depth() === 0}>
            undo
          </PaperButton>
        </PaperActions>
      </DemoSurface>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>onPatch</Eyebrow>
          <DemoLog label="onPatch log" entries={() => patches.entries()} empty="Toggle or add a todo." />
          <Eyebrow>getSnapshot</Eyebrow>
          <CodeBlock code={snapshot()} label="Current snapshot" />
        </DemoStack>
      </GlowCard>
    </DemoGrid>
  )
}
