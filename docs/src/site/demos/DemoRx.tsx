import { For, Show } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { groupBy, pipe, search, sortBy } from '@pyreon/rx'
import { font, paper, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { Segmented } from '../kit/controls'
import { DemoGrid, DemoPanel, Meters, PaperHint } from '../kit/demo'
import { Eyebrow } from '../kit/type'

interface Product {
  name: string
  cat: string
  price: number
}

const PRODUCTS: Product[] = [
  { name: 'Desk lamp', cat: 'Home', price: 39 },
  { name: 'Standing desk', cat: 'Office', price: 489 },
  { name: 'Mechanical keyboard', cat: 'Tech', price: 129 },
  { name: 'Coffee grinder', cat: 'Kitchen', price: 89 },
  { name: 'Monitor arm', cat: 'Office', price: 119 },
  { name: 'Noise headphones', cat: 'Tech', price: 249 },
  { name: 'Cast iron pan', cat: 'Kitchen', price: 45 },
  { name: 'Plant pot', cat: 'Home', price: 19 },
  { name: 'USB-C dock', cat: 'Tech', price: 179 },
  { name: 'Chef knife', cat: 'Kitchen', price: 95 },
  { name: 'Desk mat', cat: 'Office', price: 29 },
  { name: 'Throw blanket', cat: 'Home', price: 59 },
]

type Key = 'name' | 'price'
type Dir = 'asc' | 'desc'
type Grouping = 'none' | 'category'

const SearchField = el
  .config({ name: 'DemoRxSearch' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    extendCss: `
      & > input {
        box-sizing: border-box; width: 100%; height: 40px; padding: 0 16px; border-radius: ${radius.pill}px;
        border: 1px solid ${tone(m, 'line2')}; background: transparent; color: ${tone(m, 'text')};
        font: ${text.ui.size}px ${font.sans};
      }
      & > input::placeholder { color: ${tone(m, 'fog')}; }
      & > input:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 2px; }
    `,
  }))

const Control = el
  .config({ name: 'DemoRxControl' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: '84px minmax(0, 1fr)',
    alignItems: 'center',
    gap: 10,
  }))

const ControlLabel = txt
  .config({ name: 'DemoRxLabel' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

const Output = el
  .config({ name: 'DemoRxOutput' })
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme(() => ({
    minWidth: 0,
    maxHeight: 440,
    overflow: 'auto',
    extendCss: `
      & ul { margin: 0; padding: 0; list-style: none; }
      & li { display: flex; gap: 12px; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid ${paper.line}; font-size: 14px; color: ${paper.text}; }
      & li small { margin-left: 6px; color: ${paper.fog}; }
      & li b { font-weight: 500; font-variant-numeric: tabular-nums; }
      & h3 { margin: 14px 0 4px; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: ${paper.fog}; }
      & h3:first-child { margin-top: 0; }
      & p { margin: 0; font-size: 14px; color: ${paper.fog}; }
    `,
  }))

const SHAPE = `pipe(
  products,
  (xs) => search(xs, query(), ['name', 'cat']),
  (xs) => sortBy(xs, key(), dir()),
  (xs) => (grouped() ? groupBy(xs, 'cat') : xs),
)`

function Rows(props: { rows: () => Product[] }) {
  return (
    <ul>
      <For each={props.rows} by={(p) => p.name}>
        {(p) => (
          <li>
            <span>
              {p.name}
              <small>{p.cat}</small>
            </span>
            <b>${p.price}</b>
          </li>
        )}
      </For>
    </ul>
  )
}

/**
 * Rx demo (`rx.json` → demo): one real `pipe()` from `@pyreon/rx` over a
 * products signal, with the rx helpers called array-first inside each stage
 * (`search(xs, query(), keys)`, `sortBy(xs, key(), dir())`,
 * `groupBy(xs, 'cat')`). The first stage counts its own runs: the counter
 * goes up by one per input change, however many stages the pipe has.
 */
export default function DemoRx() {
  const products = signal(PRODUCTS)
  const query = signal('')
  const key = signal<Key>('name')
  const dir = signal<Dir>('asc')
  const grouping = signal<Grouping>('none')
  const grouped = () => grouping() === 'category'

  // Read only by the meter, after the pipe itself has been read.
  let runs = 0
  const result = pipe(
    products,
    (xs) => {
      runs++
      return search(xs, query(), ['name', 'cat'])
    },
    (xs) => sortBy(xs, key(), dir()),
    (xs) => (grouped() ? groupBy(xs, 'cat') : xs),
  )

  const list = () => {
    const r = result()
    return Array.isArray(r) ? r : []
  }
  const groups = () => {
    const r = result()
    return Array.isArray(r) ? [] : Object.entries(r).map(([cat, rows]) => ({ cat, rows }))
  }
  const rowsOf = (cat: string) => groups().find((g) => g.cat === cat)?.rows ?? []
  const count = () => {
    const r = result()
    return Array.isArray(r) ? r.length : Object.values(r).reduce((n, g) => n + g.length, 0)
  }
  const code = computed(
    () => `${SHAPE}\n// query() = '${query()}', grouped() = ${grouped()}\n// key() = '${key()}', dir() = '${dir()}'`,
  )

  return (
    <DemoGrid>
      <DemoPanel>
        <SearchField>
          <input
            type="search"
            placeholder="Search name or category"
            aria-label="Search products"
            autoComplete="off"
            onInput={(e: Event) => query.set((e.target as HTMLInputElement).value)}
          />
        </SearchField>
        <Control>
          <ControlLabel>sortBy</ControlLabel>
          <Segmented label="Sort by" options={['name', 'price'] as const} value={() => key()} onChange={(v) => key.set(v)} />
        </Control>
        <Control>
          <ControlLabel>direction</ControlLabel>
          <Segmented label="Direction" options={['asc', 'desc'] as const} value={() => dir()} onChange={(v) => dir.set(v)} />
        </Control>
        <Control>
          <ControlLabel>groupBy</ControlLabel>
          <Segmented label="Group by" options={['none', 'category'] as const} value={() => grouping()} onChange={(v) => grouping.set(v)} />
        </Control>
        <Eyebrow>the pipe</Eyebrow>
        <CodeBlock
          label="The pipe call"
          // The compiler wraps this read in _rp(), so CodeBlock's {props.code} follows the signal.
          // pyreon-lint-disable-next-line pyreon/no-signal-in-props
          code={code()}
        />
        <Meters
          label="Pipe"
          items={[
            {
              label: 'pipe recomputes',
              value: () => {
                result()
                return runs
              },
            },
          ]}
        />
      </DemoPanel>
      <DemoSurface aria-label="Products">
        <PaperHint aria-live="polite">{() => `${count()} of ${PRODUCTS.length} products`}</PaperHint>
        <Output>
          <Show when={() => count() > 0} fallback={<p>No products match.</p>}>
            <Show when={() => grouped()} fallback={<Rows rows={list} />}>
              <For each={groups} by={(g) => g.cat}>
                {(g) => (
                  <section>
                    <h3>
                      {g.cat} · {() => rowsOf(g.cat).length}
                    </h3>
                    <Rows rows={() => rowsOf(g.cat)} />
                  </section>
                )}
              </For>
            </Show>
          </Show>
        </Output>
      </DemoSurface>
    </DemoGrid>
  )
}
