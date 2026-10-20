/**
 * Seeded SSR↔hydration fuzz for `<For>` blocks — the compact marker format.
 *
 * SSR emits a block's LEADING run of single-element rows bare and carries
 * their keys once, on the closing marker (`<!--/pyreon-for:k0 k1 …-->`); from
 * the first row that is not a single element on, every row keeps its own
 * `<!--k:KEY-->` marker. Hydration has to rebuild the same row table from that
 * mixed shape, so the interesting inputs are exactly the ones the main parity
 * fuzz never generates: blocks whose rows switch kind part-way, nested blocks
 * inside rows, keys that need escaping, and a reorder/insert/remove/relabel
 * AFTER hydration — the moves are where a wrong anchor or range end surfaces.
 *
 * Oracles, per seed:
 *   O1  hydration reports no mismatch;
 *   O2  every server ELEMENT is still on screen afterwards (rows adopted, not
 *       rebuilt — a silent rebuild passes every DOM-equality check);
 *   O3  after the same mutation script, the hydrated tree equals a fresh client
 *       mount driven through the same script;
 *   O4  and both equal a fresh mount of the FINAL state (ground truth).
 */
import { For, Fragment, h } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { disableHydrationWarnings, hydrateRoot, mount, onHydrationMismatch } from '../index'

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Kind = 'el' | 'comp' | 'frag' | 'text' | 'nested' | 'acc' | 'poly' | 'fragpoly'
const KINDS: Kind[] = ['el', 'el', 'el', 'comp', 'frag', 'text', 'nested', 'acc', 'poly', 'fragpoly']
// Keys that exercise the escape path and the space separator.
const ODD_KEYS = ['a b', 'x-->', '50%', 'é', '', '-', 'k:1', '/pyreon-for']

interface Spec {
  key: string | number
  kind: Kind
  label: string
  sub: number[]
}
interface Item {
  key: string | number
  kind: Kind
  label: Signal<string>
  sub: Signal<number[]>
}

const Comp = (props: { item: Item }) => h('li', { class: 'c' }, () => props.item.label())

function row(item: Item): unknown {
  switch (item.kind) {
    case 'el':
      return h('li', { 'data-k': String(item.key) }, () => item.label())
    case 'comp':
      return h(Comp, { item })
    case 'frag':
      return h(Fragment, null, h('li', null, 'f1'), h('li', null, () => item.label()))
    case 'text':
      return () => item.label()
    case 'nested':
      return h(
        'li',
        null,
        h(For, {
          each: () => item.sub(),
          by: (n: number) => n,
          children: (n: number) => h('i', null, String(n)),
        } as never),
      )
    case 'poly':
      // Text that becomes an element after a relabel — the binding swaps its
      // own (only) node.
      return () => (item.label().startsWith('R') ? h('b', null, item.label()) : item.label())
    case 'fragpoly':
      // Same, as the LAST node of a multi-node row.
      return h(
        Fragment,
        null,
        h('li', null, 'p'),
        () => (item.label().startsWith('R') ? h('b', null, item.label()) : item.label()),
      )
    case 'acc':
      return () => (item.label().length % 2 ? h('li', null, item.label()) : h('em', null, item.label()))
  }
}

function genSpecs(r: () => number, n: number, used: Set<string>): Spec[] {
  const out: Spec[] = []
  // Bias the first rows toward bare elements so the leading-run boundary moves
  // around from seed to seed instead of always sitting at index 0.
  const leadRun = Math.floor(r() * (n + 1))
  for (let i = 0; i < n; i++) {
    let key: string | number
    do {
      key = r() < 0.15 ? `${ODD_KEYS[Math.floor(r() * ODD_KEYS.length)]}${Math.floor(r() * 50)}` : Math.floor(r() * 1000)
    } while (used.has(String(key)))
    used.add(String(key))
    const kind = i < leadRun ? 'el' : (KINDS[Math.floor(r() * KINDS.length)] as Kind)
    const sub = Array.from({ length: Math.floor(r() * 3) }, (_, j) => j * 7 + Math.floor(r() * 5))
    out.push({ key, kind, label: `L${Math.floor(r() * 99)}`, sub: [...new Set(sub)] })
  }
  return out
}

const instantiate = (s: Spec): Item => ({
  key: s.key,
  kind: s.kind,
  label: signal(s.label),
  sub: signal(s.sub),
})

function app(list: Signal<Item[]>, tail: Signal<string>) {
  return h(
    'main',
    null,
    h(
      'ul',
      null,
      h(For, { each: () => list(), by: (it: Item) => it.key, children: row } as never),
      h('li', { class: 'tail' }, () => tail()),
    ),
    h('p', null, 'after'),
  )
}

const cmp = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '')

/** One mutation script, applied identically to every instance. */
function script(r: () => number, specs: Spec[], used: Set<string>): Array<(l: Signal<Item[]>) => void> {
  const steps: Array<(l: Signal<Item[]>) => void> = []
  const count = 1 + Math.floor(r() * 4)
  for (let s = 0; s < count; s++) {
    const op = r()
    if (op < 0.3) {
      const seed = Math.floor(r() * 1e9)
      steps.push((l) => {
        const rr = mulberry32(seed)
        const next = [...l()]
        for (let i = next.length - 1; i > 0; i--) {
          const j = Math.floor(rr() * (i + 1))
          ;[next[i], next[j]] = [next[j] as Item, next[i] as Item]
        }
        l.set(next)
      })
    } else if (op < 0.5) {
      const at = r()
      steps.push((l) => l.set(l().filter((_, i) => Math.floor(at * l().length) !== i)))
    } else if (op < 0.7) {
      const add = genSpecs(r, 1 + Math.floor(r() * 2), used)
      const at = r()
      steps.push((l) => {
        const next = [...l()]
        next.splice(Math.floor(at * (next.length + 1)), 0, ...add.map(instantiate))
        l.set(next)
      })
    } else if (op < 0.85) {
      const at = r()
      const label = `R${Math.floor(r() * 999)}`
      steps.push((l) => {
        const it = l()[Math.floor(at * l().length)]
        if (it) it.label.set(label)
      })
    } else {
      const at = r()
      const sub = [3, 1, 2].slice(0, 1 + Math.floor(r() * 3))
      steps.push((l) => {
        const it = l()[Math.floor(at * l().length)]
        if (it) it.sub.set(sub)
      })
    }
  }
  void specs
  return steps
}

describe('<For> compact-marker hydration fuzz', () => {
  const SEEDS = Math.max(
    1,
    Number((process.env as Record<string, string | undefined>).PYREON_FUZZ_SEEDS) || 400,
  )

  it(`${SEEDS} seeded blocks hydrate, adopt, and converge after mutation`, { timeout: Math.max(30_000, SEEDS * 40) }, async () => {
    disableHydrationWarnings()
    const failures: string[] = []
    for (let seed = 1; seed <= SEEDS && failures.length < 5; seed++) {
      const r = mulberry32(seed)
      const used = new Set<string>()
      const specs = genSpecs(r, Math.floor(r() * 7), used)
      const steps = script(r, specs, used)

      const listS = signal(specs.map(instantiate))
      const html = await renderToString(app(listS, signal('T')) as never)

      // A — hydrated
      const listA = signal(specs.map(instantiate))
      const tailA = signal('T')
      const cA = document.createElement('div')
      document.body.appendChild(cA)
      cA.innerHTML = html
      const serverEls = [...cA.querySelectorAll('*')]
      const mismatches: string[] = []
      const off = onHydrationMismatch((ctx) => mismatches.push(`${ctx.type}@${ctx.path}`))
      const cleanupA = hydrateRoot(cA, app(listA, tailA) as never)
      off()

      // B — fresh client mount of the initial state
      const listB = signal(specs.map(instantiate))
      const tailB = signal('T')
      const cB = document.createElement('div')
      document.body.appendChild(cB)
      const cleanupB = mount(app(listB, tailB) as never, cB)

      const tag = `seed=${seed} specs=${JSON.stringify(specs.map((s) => [s.key, s.kind]))}`
      if (mismatches.length > 0) failures.push(`${tag} O1 ${mismatches[0]}`)
      else {
        const live = new Set(cA.querySelectorAll('*'))
        const lost = serverEls.filter((el) => !live.has(el)).length
        if (lost > 0) failures.push(`${tag} O2 ${lost}/${serverEls.length} server elements rebuilt`)
        else if (cmp(cA.innerHTML) !== cmp(cB.innerHTML)) failures.push(`${tag} O3 initial divergence`)
        else {
          for (const step of steps) {
            batch(() => step(listA))
            batch(() => step(listB))
          }
          tailA.set('U')
          tailB.set('U')
          const truthC = document.createElement('div')
          const finalSpecs: Spec[] = listB().map((it) => ({
            key: it.key,
            kind: it.kind,
            label: it.label.peek(),
            sub: it.sub.peek(),
          }))
          const cleanupC = mount(app(signal(finalSpecs.map(instantiate)), signal('U')) as never, truthC)
          if (cmp(cA.innerHTML) !== cmp(cB.innerHTML)) {
            failures.push(`${tag} O3 post-mutation\n  A=${cmp(cA.innerHTML)}\n  B=${cmp(cB.innerHTML)}`)
          } else if (cmp(cA.innerHTML) !== cmp(truthC.innerHTML)) {
            failures.push(`${tag} O4 ground truth\n  A=${cmp(cA.innerHTML)}\n  C=${cmp(truthC.innerHTML)}`)
          }
          cleanupC()
        }
      }
      cleanupA()
      cleanupB()
      cA.remove()
      cB.remove()
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('non-vacuity: the corpus produces bare-only, marked-only and mixed blocks', async () => {
    let bare = 0
    let marked = 0
    let mixed = 0
    for (let seed = 1; seed <= 200; seed++) {
      const r = mulberry32(seed)
      const specs = genSpecs(r, Math.floor(r() * 7), new Set())
      const html = await renderToString(app(signal(specs.map(instantiate)), signal('T')) as never)
      const block = html.slice(html.indexOf('<!--pyreon-for-->'))
      const hasLead = /<!--\/pyreon-for:[^>]*-->/.test(block)
      const hasK = /<!--k:/.test(block)
      if (hasLead && hasK) mixed++
      else if (hasLead) bare++
      else if (hasK) marked++
    }
    expect(bare).toBeGreaterThan(10)
    expect(marked).toBeGreaterThan(10)
    expect(mixed).toBeGreaterThan(10)
  })
})
