/**
 * Pyreon — krausest/js-framework-benchmark keyed implementation.
 *
 * Idiomatic Pyreon: signals + <For by> keyed reconciliation +
 * createSelector for O(1) selection + a per-row signal for fine-grained
 * label updates (only the changed row's text node patches).
 */
import { For } from '@pyreon/core'
import { batch, createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'

const ADJECTIVES = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome',
  'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful',
  'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy',
]
const COLOURS = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'black', 'orange',
]
const NOUNS = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie',
  'sandwich', 'burger', 'pizza', 'mouse', 'keyboard',
]

const random = (max: number) => Math.round(Math.random() * 1000) % max

let nextId = 1

interface Row {
  id: number
  label: ReturnType<typeof signal<string>>
}

function buildData(count: number): Row[] {
  const data = new Array<Row>(count)
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: signal(
        `${ADJECTIVES[random(ADJECTIVES.length)]} ${COLOURS[random(COLOURS.length)]} ${NOUNS[random(NOUNS.length)]}`,
      ),
    }
  }
  return data
}

const rows = signal<Row[]>([])
const selected = signal<number | null>(null)
const isSelected = createSelector(selected)

const run = () => rows.set(buildData(1_000))
const runLots = () => rows.set(buildData(10_000))
const add = () => rows.set([...rows(), ...buildData(1_000)])
const update = () => {
  const current = rows()
  for (let i = 0; i < current.length; i += 10) {
    current[i]!.label.update((l) => `${l} !!!`)
  }
}
const clear = () =>
  batch(() => {
    rows.set([])
    selected.set(null)
  })
const swapRows = () => {
  const current = rows()
  if (current.length > 998) {
    const next = current.slice()
    const a = next[1]!
    next[1] = next[998]!
    next[998] = a
    rows.set(next)
  }
}
const remove = (id: number) => rows.set(rows().filter((r) => r.id !== id))
const select = (id: number) => selected.set(id)

function Button(props: { id: string; text: string; fn: () => void }) {
  return (
    <div class="col-sm-6 smallpad">
      <button
        id={props.id}
        class="btn btn-primary btn-block"
        type="button"
        onClick={props.fn}
      >
        {props.text}
      </button>
    </div>
  )
}

function App() {
  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Pyreon-keyed</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Button id="run" text="Create 1,000 rows" fn={run} />
              <Button id="runlots" text="Create 10,000 rows" fn={runLots} />
              <Button id="add" text="Append 1,000 rows" fn={add} />
              <Button id="update" text="Update every 10th row" fn={update} />
              <Button id="clear" text="Clear" fn={clear} />
              <Button id="swaprows" text="Swap Rows" fn={swapRows} />
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          <For each={rows} by={(row: Row) => row.id}>
            {(row: Row) => (
              <tr class={() => (isSelected(row.id) ? 'danger' : '')}>
                <td class="col-md-1">{String(row.id)}</td>
                <td class="col-md-4">
                  <a onClick={() => select(row.id)}>{() => row.label()}</a>
                </td>
                <td class="col-md-1">
                  <a onClick={() => remove(row.id)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                  </a>
                </td>
                <td class="col-md-6"></td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
    </div>
  )
}

mount(<App />, document.getElementById('main')!)
