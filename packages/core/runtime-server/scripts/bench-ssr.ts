/**
 * SSR throughput bench — renderToString on a real-app-shaped tree.
 *
 * Run with NODE_ENV=production against the BUILT lib (what consumers run):
 *   cd packages/core/runtime-server
 *   NODE_ENV=production bun scripts/bench-ssr.ts [--profile]
 *
 * Workloads:
 *   blog-index : header/nav + <For> over 50 post cards (component-per-card,
 *                nested elements, props, class arrays, text) + footer
 *   table-1k   : 1,000-row keyed <For> table (the SSR analog of create-1k)
 *   deep-tree  : 10-deep nested component chain ×100 (provider/consumer mix)
 *
 * 30 timed batches of N renders each; reports per-render µs median + CI-ish
 * spread (min/p25/median/p75/max of batch means). GC between batches when
 * --expose-gc style API is available (bun: Bun.gc).
 */
import { For, Fragment, h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '../src/index'

type Post = { id: number; title: string; author: string; tags: string[]; excerpt: string }
const POSTS: Post[] = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  title: `Post title number ${i} with some realistic length`,
  author: `author-${i % 7}`,
  tags: [`tag-${i % 5}`, `tag-${i % 3}`, 'featured'],
  excerpt:
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
}))

const Tag = (props: { name: string }) => h('span', { class: 'tag tag--small' }, props.name)
const Card = (props: { post: Post }) => {
  const p = props.post
  return h(
    'article',
    { class: ['card', p.id % 2 === 0 ? 'card--even' : 'card--odd'], 'data-id': String(p.id) },
    h('h2', { class: 'card__title' }, p.title),
    h(
      'div',
      { class: 'card__meta' },
      h('span', { class: 'card__author' }, p.author),
      h('ul', { class: 'card__tags' }, ...p.tags.map((t) => h('li', null, h(Tag, { name: t })))),
    ),
    h('p', { class: 'card__excerpt' }, p.excerpt),
    h('a', { href: `/posts/${p.id}`, class: 'card__link' }, 'Read more'),
  )
}
const Header = () =>
  h(
    'header',
    { class: 'site-header' },
    h('a', { href: '/', class: 'logo' }, 'My Site'),
    h(
      'nav',
      null,
      ...['Home', 'Posts', 'About', 'Contact'].map((x) =>
        h('a', { href: `/${x.toLowerCase()}`, class: 'nav-link' }, x),
      ),
    ),
  )
const BlogIndex = () =>
  h(
    'div',
    { class: 'page' },
    h(Header, null),
    h(
      'main',
      { class: 'content' },
      h(For as never, {
        each: () => POSTS,
        by: (p: Post) => p.id,
        children: (p: Post) => h(Card, { post: p }),
      } as never),
    ),
    h('footer', { class: 'site-footer' }, h('p', null, '© 2026')),
  )

type Row = { id: number; label: string; value: number }
const ROWS: Row[] = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  label: `row label ${i}`,
  value: i * 7,
}))
const TableRow = (props: { row: Row }) =>
  h(
    'tr',
    { class: props.row.id % 2 ? 'odd' : 'even' },
    h('td', null, String(props.row.id)),
    h('td', { class: 'label' }, props.row.label),
    h('td', { class: 'value' }, String(props.row.value)),
  )
const Table1k = () =>
  h(
    'table',
    null,
    h('tbody', null, h(For as never, {
      each: () => ROWS,
      by: (r: Row) => r.id,
      children: (r: Row) => h(TableRow, { row: r }),
    } as never)),
  )

const Leaf = (props: { n: number }) => h('span', { class: `leaf-${props.n}` }, `leaf ${props.n}`)
function nest(depth: number, n: number): unknown {
  if (depth === 0) return h(Leaf, { n })
  const Mid = (props: { d: number }) =>
    h('div', { class: `lvl-${props.d}` }, nest(props.d - 1, n) as never)
  return h(Mid, { d: depth })
}
const DeepTree = () =>
  h(Fragment, null, ...Array.from({ length: 100 }, (_, i) => nest(10, i) as never))

const WORKLOADS: Record<string, { fn: () => unknown; perBatch: number }> = {
  'blog-index': { fn: BlogIndex, perBatch: 50 },
  'table-1k': { fn: Table1k, perBatch: 10 },
  'deep-tree': { fn: DeepTree, perBatch: 20 },
}

const gc = (globalThis as { Bun?: { gc(force: boolean): void } }).Bun?.gc

async function bench(name: string, makeVNode: () => unknown, perBatch: number) {
  // sanity render + warmup
  const html = (await runWithRequestContext(async () =>
    renderToString(h(makeVNode as never, null)),
  )) as string
  if (html.length < 100) throw new Error(`${name}: suspiciously short output`)
  for (let w = 0; w < 5; w++) {
    await runWithRequestContext(async () => renderToString(h(makeVNode as never, null)))
  }
  const batchMeans: number[] = []
  for (let b = 0; b < (process.env.PROFILE ? 120 : 30); b++) {
    gc?.(true)
    const t0 = performance.now()
    for (let i = 0; i < perBatch; i++) {
      await runWithRequestContext(async () => renderToString(h(makeVNode as never, null)))
    }
    const dt = performance.now() - t0
    batchMeans.push((dt / perBatch) * 1000) // µs per render
  }
  batchMeans.sort((a, b2) => a - b2)
  const q = (p: number) => batchMeans[Math.floor(p * (batchMeans.length - 1))]?.toFixed(0)
  console.log(
    `${name.padEnd(12)} bytes=${String(html.length).padStart(7)}  per-render µs  min=${q(0)} p25=${q(0.25)} MEDIAN=${q(0.5)} p75=${q(0.75)} max=${q(1)}`,
  )
}

for (const [name, w] of Object.entries(WORKLOADS)) {
  await bench(name, w.fn as () => unknown, w.perBatch)
}
