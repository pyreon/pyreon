import { For, onMount, onUnmount, Show } from '@pyreon/core'
import { computed, effectScope, signal } from '@pyreon/reactivity'
import { batchUrlUpdates, setUrlRouter, useUrlState } from '@pyreon/url-state'
import { font, paper, weight } from '../theme'
import { el, txt } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { DemoGrid, DemoPanel, Meters, PaperHint, PaperLabel } from '../kit/demo'
import { PaperToggle, ToggleRow } from './_toggle-b'

type Sort = 'name' | 'price' | 'rating'
type Product = { id: string; name: string; price: number; rating: number; inStock: boolean }

const SORTS: readonly Sort[] = ['name', 'price', 'rating']
const PAGE_SIZE = 3
const PATH = '/products/urlstate'

const PRODUCTS: readonly Product[] = [
  { id: 'arc', name: 'Arc floor lamp', price: 189, rating: 4.6, inStock: true },
  { id: 'bea', name: 'Beam desk lamp', price: 79, rating: 4.2, inStock: false },
  { id: 'cot', name: 'Cotton throw', price: 59, rating: 4.8, inStock: true },
  { id: 'dun', name: 'Dune armchair', price: 640, rating: 4.4, inStock: true },
  { id: 'elm', name: 'Elm side table', price: 210, rating: 4.1, inStock: false },
  { id: 'fen', name: 'Fern planter', price: 38, rating: 4.7, inStock: true },
  { id: 'glo', name: 'Globe pendant lamp', price: 149, rating: 4.5, inStock: true },
  { id: 'hal', name: 'Halo wall lamp', price: 99, rating: 3.9, inStock: true },
]

/**
 * The demo's params carry a `shop-` prefix so they can never collide with
 * anything else the site puts in the query.
 */
const SOURCE = `const q = useUrlState('shop-q', '', { debounce: 300 })
const sort = useUrlState('shop-sort', 'name')
const inStock = useUrlState('shop-stock', false)
const page = useUrlState('shop-page', 1)`

const Stack = el.config({ name: 'UsStack' }).attrs({ block: true, gap: 14, contentAlignX: 'block' })

const UrlBar = txt
  .config({ name: 'UsUrlBar' })
  .attrs({ tag: 'p' })
  .theme(() => ({
    margin: 0,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 10,
    border: `1px solid ${paper.line}`,
    backgroundColor: paper.field,
    fontFamily: font.mono,
    fontSize: 12,
    color: paper.mist,
    overflowWrap: 'anywhere',
    extendCss: `& b { color: ${paper.accent}; font-weight: ${weight.medium}; }`,
  }))

const Fields = el
  .config({ name: 'UsFields' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' },
    gap: 12,
    extendCss: `
      & input[type='search'] {
        box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border-radius: 8px;
        border: 1px solid ${paper.line}; background: ${paper.field}; color: ${paper.text}; font: 14px ${font.system};
      }
      & input[type='search']::placeholder { color: ${paper.fog}; }
      & input:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 1px; }
    `,
  }))

const Checkbox = txt
  .config({ name: 'UsCheck' })
  .attrs({ tag: 'label' })
  .theme(() => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: weight.medium,
    color: paper.text,
    extendCss: `& input { width: 16px; height: 16px; margin: 0; accent-color: ${paper.accent}; } & input:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }`,
  }))

const Bar = el
  .config({ name: 'UsBar' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 16 })
  .theme(() => ({ flexWrap: 'wrap' }))

const Pager = el
  .config({ name: 'UsPager' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ fontSize: 14, color: paper.text }))

const List = el
  .config({ name: 'UsList' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0, minHeight: 3 * 41 }))

const Item = el
  .config({ name: 'UsItem' })
  .attrs({ tag: 'li', block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: 12,
    alignItems: 'baseline',
    paddingTop: 10,
    paddingBottom: 10,
    borderBottom: `1px solid ${paper.line}`,
    fontSize: 14,
    color: paper.text,
    extendCss: `& small { color: ${paper.fog}; font-size: 12.5px; font-variant-numeric: tabular-nums; }`,
  }))

const Empty = txt
  .config({ name: 'UsEmpty' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, paddingTop: 10, fontSize: 14, color: paper.fog }))

/**
 * URL-state demo (`urlstate.json` → demo): four real `useUrlState` signals
 * from `@pyreon/url-state`, bound to the PAGE's query string. Defaults are
 * dropped from the URL, the search is debounced 300 ms, and the in-stock
 * toggle resets the page in one `batchUrlUpdates` write. Reload the page with
 * the params set and the controls come back from the URL.
 *
 * SSR: the server has no URL, so it renders the defaults; the hydrating
 * client renders the defaults too (`ready` is false until mount) and then
 * switches to the URL's values, so hydration never sees the query.
 *
 * Writes go through `setUrlRouter` with a minimal history bridge that keeps
 * `history.state`: url-state's own raw-history branch writes `null` state,
 * which would erase @pyreon/router's `__pyreonIdx` stamp on this entry
 * (reported with the products-b demos). The bridge also shows on screen the
 * exact URL each write produced.
 *
 * Teardown: the four signals live in an `effectScope` this demo stops itself.
 * A zero island is never unmounted on client-side navigation (its hydration
 * root is not disposed; reported with the products-b demos), so `onUnmount`
 * alone would leave url-state's popstate listeners and a pending debounced
 * write alive, and that write would land in the NEXT page's URL. The demo
 * stops the scope when its root leaves the document, and the bridge drops any
 * write once the path is no longer this page's.
 */
export default function DemoUrlstate() {
  const scope = effectScope()
  const { q, sort, inStock, page } = scope.runInScope(() => ({
    q: useUrlState('shop-q', '', { debounce: 300 }),
    sort: useUrlState<Sort>('shop-sort', 'name', {
      deserialize: (raw: string): Sort => SORTS.find((s) => s === raw) ?? 'name',
    }),
    inStock: useUrlState('shop-stock', false),
    page: useUrlState('shop-page', 1),
  }))

  const ready = signal(false)
  const href = signal(PATH)
  const writes = signal(0)
  const edits = signal(0)

  let root: HTMLElement | null = null
  let observer: MutationObserver | undefined
  let live = true
  const teardown = () => {
    if (!live) return
    live = false
    observer?.disconnect()
    scope.stop()
    setUrlRouter(null)
  }

  onMount(() => {
    const path = window.location.pathname
    href.set(path + window.location.search)
    setUrlRouter({
      mode: 'history',
      replace: (next: string) => {
        if (!root?.isConnected || window.location.pathname !== path) {
          teardown()
          return
        }
        window.history.replaceState(window.history.state, '', next)
        href.set(next.split('#')[0] ?? next)
        writes.update((n) => n + 1)
      },
    })
    observer = new MutationObserver(() => {
      if (!root?.isConnected) teardown()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    ready.set(true)
  })
  onUnmount(teardown)

  // Before mount (server render and hydration) everything reads the defaults.
  const vq = () => (ready() ? q() : '')
  const vsort = () => (ready() ? sort() : 'name')
  const vstock = () => (ready() ? inStock() : false)
  const vpage = () => (ready() ? page() : 1)

  const matches = computed(() => {
    const term = vq().trim().toLowerCase()
    const s = vsort()
    return PRODUCTS.filter(
      (p) => (!vstock() || p.inStock) && (!term || p.name.toLowerCase().includes(term)),
    ).sort((a, b) =>
      s === 'name'
        ? a.name.localeCompare(b.name)
        : s === 'price'
          ? a.price - b.price
          : b.rating - a.rating,
    )
  })
  const pages = computed(() => Math.max(1, Math.ceil(matches().length / PAGE_SIZE)))
  const shown = computed(() => {
    const p = Math.min(vpage(), pages())
    return matches().slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
  })

  const query = computed(() => {
    const i = href().indexOf('?')
    return i === -1 ? [] : [...new URLSearchParams(href().slice(i + 1))]
  })

  const setQ = (v: string) => {
    edits.update((n) => n + 1)
    q.set(v)
    if (page() !== 1) page.set(1)
  }
  const setStock = (v: boolean) =>
    batchUrlUpdates(() => {
      inStock.set(v)
      page.set(1)
    })

  return (
    <div
      ref={(e: Element | null) => {
        root = e as HTMLElement | null
      }}
    >
      <DemoGrid>
        <DemoSurface aria-label="Product list with filters kept in the URL">
          <Stack>
            <UrlBar aria-live="polite" aria-label="Current page address">
              {() => href().split('?')[0]}
              {() => (query().length ? '?' : '')}
              <For
                each={() => query().map(([k, v], i) => ({ k, v, i }))}
                by={(e) => `${e.i}:${e.k}`}
              >
                {(e) => (
                  <span>
                    {e.i > 0 ? '&' : ''}
                    <b>{e.k}</b>={encodeURIComponent(e.v)}
                  </span>
                )}
              </For>
            </UrlBar>
            <Fields>
              <div>
                <PaperLabel for="us-demo-q">Search</PaperLabel>
                <input
                  id="us-demo-q"
                  type="search"
                  placeholder="Try lamp"
                  autoComplete="off"
                  value={vq()}
                  onInput={(e: Event) => setQ((e.target as HTMLInputElement).value)}
                />
              </div>
              <div>
                <PaperLabel id="us-demo-sort">Sort</PaperLabel>
                <ToggleRow aria-labelledby="us-demo-sort">
                  <For each={SORTS} by={(s) => s}>
                    {(s) => (
                      <PaperToggle
                        type="button"
                        aria-pressed={() => (vsort() === s ? 'true' : 'false')}
                        onClick={() => sort.set(s)}
                      >
                        {s}
                      </PaperToggle>
                    )}
                  </For>
                </ToggleRow>
              </div>
            </Fields>
            <Bar>
              <Checkbox>
                <input
                  type="checkbox"
                  checked={vstock()}
                  onChange={(e: Event) => setStock((e.target as HTMLInputElement).checked)}
                />
                In stock
              </Checkbox>
              <Pager>
                <span id="us-demo-page">Page</span>
                <PaperToggle
                  type="button"
                  aria-label="Previous page"
                  disabled={vpage() <= 1}
                  onClick={() => page.set(Math.max(1, page() - 1))}
                >
                  ‹
                </PaperToggle>
                <b aria-describedby="us-demo-page">
                  {() => `${Math.min(vpage(), pages())} / ${pages()}`}
                </b>
                <PaperToggle
                  type="button"
                  aria-label="Next page"
                  disabled={vpage() >= pages()}
                  onClick={() => page.set(Math.min(pages(), page() + 1))}
                >
                  ›
                </PaperToggle>
              </Pager>
            </Bar>
            <Show when={() => shown().length > 0} fallback={<Empty>No products match.</Empty>}>
              <List aria-label="Products">
                <For each={() => shown()} by={(p) => p.id}>
                  {(p) => (
                    <Item>
                      <span>{p.name}</span>
                      <small>{`★ ${p.rating.toFixed(1)}`}</small>
                      <small>{`$${p.price}`}</small>
                    </Item>
                  )}
                </For>
              </List>
            </Show>
            <PaperHint>Reload the page: the filters come back from the URL.</PaperHint>
          </Stack>
        </DemoSurface>
        <DemoPanel note="Each write uses replaceState, so Back leaves the page instead of stepping through every filter. Defaults never appear in the address bar.">
          <Stack>
            <CodeBlock code={SOURCE} label="The four URL-synced signals" />
            <Meters
              label="Search keystrokes against URL writes"
              items={[
                { label: 'search edits', value: () => edits() },
                { label: 'URL writes (replaceState)', value: () => writes() },
                { label: 'params in the URL', value: () => query().length },
              ]}
            />
          </Stack>
        </DemoPanel>
      </DemoGrid>
    </div>
  )
}
