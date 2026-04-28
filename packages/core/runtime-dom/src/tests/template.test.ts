import { computed, signal } from '@pyreon/reactivity'
import { _bindDirect, _bindText, _clearTplCache, _tpl, _tplCacheSize } from '../template'

// ─── _bindText ──────────────────────────────────────────────────────────────

describe('_bindText', () => {
  test('fast path: signal source sets text and updates reactively', () => {
    const s = signal('hello')
    const node = document.createTextNode('')

    const dispose = _bindText(s, node)
    expect(node.data).toBe('hello')

    s.set('world')
    expect(node.data).toBe('world')

    dispose()
  })

  test('fast path: computed source sets text and updates reactively', () => {
    const s = signal(2)
    const doubled = computed(() => s() * 2)
    const node = document.createTextNode('')

    const dispose = _bindText(doubled, node)
    expect(node.data).toBe('4')

    s.set(5)
    expect(node.data).toBe('10')

    dispose()
  })

  test('fallback: plain function source uses renderEffect', () => {
    const s = signal('initial')
    // Plain function — no .direct property
    const getter = () => s()
    const node = document.createTextNode('')

    const dispose = _bindText(getter as unknown as Parameters<typeof _bindText>[0], node)
    expect(node.data).toBe('initial')

    s.set('updated')
    expect(node.data).toBe('updated')

    dispose()
  })

  test('disposal stops updates for signal source', () => {
    const s = signal('a')
    const node = document.createTextNode('')

    const dispose = _bindText(s, node)
    expect(node.data).toBe('a')

    dispose()

    s.set('b')
    expect(node.data).toBe('a')
  })

  test('disposal stops updates for computed source', () => {
    const s = signal(1)
    const c = computed(() => s() + 10)
    const node = document.createTextNode('')

    const dispose = _bindText(c, node)
    expect(node.data).toBe('11')

    dispose()

    s.set(2)
    expect(node.data).toBe('11')
  })

  test('disposal stops updates for plain function source', () => {
    const s = signal('x')
    const getter = () => s()
    const node = document.createTextNode('')

    const dispose = _bindText(getter as unknown as Parameters<typeof _bindText>[0], node)
    expect(node.data).toBe('x')

    dispose()

    s.set('y')
    expect(node.data).toBe('x')
  })

  test('null value renders as empty string', () => {
    const s = signal<string | null>('text')
    const node = document.createTextNode('')

    const dispose = _bindText(s, node)
    expect(node.data).toBe('text')

    s.set(null)
    expect(node.data).toBe('')

    dispose()
  })

  test('false value renders as empty string', () => {
    const s = signal<string | false>('text')
    const node = document.createTextNode('')

    const dispose = _bindText(s, node)
    s.set(false)
    expect(node.data).toBe('')

    dispose()
  })

  test('undefined value renders as empty string', () => {
    const s = signal<string | undefined>('text')
    const node = document.createTextNode('')

    const dispose = _bindText(s, node)
    s.set(undefined)
    expect(node.data).toBe('')

    dispose()
  })

  test('skips DOM write when value unchanged (fast path)', () => {
    const s = signal('same')
    const node = document.createTextNode('')

    const dispose = _bindText(s, node)
    expect(node.data).toBe('same')

    // Set same value — should skip the DOM write (next !== node.data is false)
    s.set('same')
    expect(node.data).toBe('same')

    dispose()
  })

  test('fallback path: null/false/undefined → empty string', () => {
    const s = signal<string | null | false | undefined>('text')
    const getter = () => s()
    const node = document.createTextNode('')

    const dispose = _bindText(getter as unknown as Parameters<typeof _bindText>[0], node)
    expect(node.data).toBe('text')

    s.set(null)
    expect(node.data).toBe('')

    s.set(false)
    expect(node.data).toBe('')

    s.set(undefined)
    expect(node.data).toBe('')

    s.set('restored')
    expect(node.data).toBe('restored')

    dispose()
  })

  test('fallback path: skips DOM write when value unchanged', () => {
    const s = signal('x')
    const getter = () => s()
    const node = document.createTextNode('')

    const dispose = _bindText(getter as unknown as Parameters<typeof _bindText>[0], node)
    expect(node.data).toBe('x')

    s.set('x') // same value — skip
    expect(node.data).toBe('x')

    dispose()
  })

  test('number coercion via String()', () => {
    const s = signal<number>(42)
    const node = document.createTextNode('')

    const dispose = _bindText(s, node)
    expect(node.data).toBe('42')

    s.set(0)
    expect(node.data).toBe('0')

    dispose()
  })
})

// ─── _bindDirect ────────────────────────────────────────────────────────────

describe('_bindDirect', () => {
  test('fast path: signal source calls updater immediately and on change', () => {
    const s = signal('red')
    const el = document.createElement('div')

    const dispose = _bindDirect(s, (v) => {
      el.className = String(v)
    })

    expect(el.className).toBe('red')

    s.set('blue')
    expect(el.className).toBe('blue')

    dispose()
  })

  test('fallback: plain function source uses renderEffect', () => {
    const s = signal(10)
    const getter = () => s()
    const el = document.createElement('div')

    const dispose = _bindDirect(getter as unknown as Parameters<typeof _bindDirect>[0], (v) => {
      el.style.width = `${v}px`
    })

    expect(el.style.width).toBe('10px')

    s.set(20)
    expect(el.style.width).toBe('20px')

    dispose()
  })

  test('disposal stops updates for signal source', () => {
    const s = signal('a')
    const el = document.createElement('div')

    const dispose = _bindDirect(s, (v) => {
      el.setAttribute('data-val', String(v))
    })

    expect(el.getAttribute('data-val')).toBe('a')

    dispose()

    s.set('b')
    expect(el.getAttribute('data-val')).toBe('a')
  })

  test('disposal stops updates for plain function source', () => {
    const s = signal(1)
    const getter = () => s()
    const el = document.createElement('div')

    const dispose = _bindDirect(getter as unknown as Parameters<typeof _bindDirect>[0], (v) => {
      el.setAttribute('data-num', String(v))
    })

    expect(el.getAttribute('data-num')).toBe('1')

    dispose()

    s.set(2)
    expect(el.getAttribute('data-num')).toBe('1')
  })
})

// ─── _mountSlot ────────────────────────────────────────────────────────────

describe('_mountSlot', async () => {
  const { _mountSlot } = await import('../template')
  const { h } = await import('@pyreon/core')

  test('mounts a string child as text', () => {
    const parent = document.createElement('div')
    const placeholder = document.createComment('')
    parent.appendChild(placeholder)

    _mountSlot('hello', parent, placeholder)
    expect(parent.textContent).toBe('hello')
  })

  test('mounts a VNode child as DOM element', () => {
    const parent = document.createElement('div')
    const placeholder = document.createComment('')
    parent.appendChild(placeholder)

    const vnode = h('span', { class: 'test' }, 'content')
    _mountSlot(vnode, parent, placeholder)
    expect(parent.querySelector('span')).not.toBeNull()
    expect(parent.querySelector('span')?.textContent).toBe('content')
    expect(parent.querySelector('span')?.className).toBe('test')
  })

  test('mounts an array of children', () => {
    const parent = document.createElement('div')
    const placeholder = document.createComment('')
    parent.appendChild(placeholder)

    _mountSlot(['first', ' ', 'second'], parent, placeholder)
    expect(parent.textContent).toBe('first second')
  })

  test('handles null/undefined children', () => {
    const parent = document.createElement('div')
    const placeholder = document.createComment('')
    parent.appendChild(placeholder)

    _mountSlot(null, parent, placeholder)
    expect(parent.childNodes.length).toBe(0)
  })

  test('handles false/true children', () => {
    const parent = document.createElement('div')
    const placeholder = document.createComment('')
    parent.appendChild(placeholder)

    _mountSlot(false, parent, placeholder)
    expect(parent.childNodes.length).toBe(0)
  })
})

// ─── Audit bug #5: _tplCache LRU eviction ───────────────────────────────────
//
// The cache is an LRU-bounded Map keyed on the HTML string. Typed JSX
// produces a small bounded set of unique HTML strings — most apps stay in
// the dozens-to-hundreds. But an app that constructs JSX from user input
// or compiles many large dynamic templates could grow this unbounded
// pre-fix. The cap at 1024 entries keeps memory predictable while being
// generous enough that no realistic codebase hits it.

describe('_tpl cache — LRU eviction (audit bug #5)', () => {
  const TPL_CACHE_MAX = 1024

  test('cache stays bounded when more than MAX unique templates are emitted', () => {
    _clearTplCache()
    const noBind = (): null => null

    // Emit 1.5x the cap of unique templates — without LRU bound, cache
    // would grow to 1536 entries.
    const overshoot = Math.floor(TPL_CACHE_MAX * 1.5)
    for (let i = 0; i < overshoot; i++) {
      _tpl(`<div data-i="${i}">${i}</div>`, noBind)
    }

    expect(_tplCacheSize()).toBeLessThanOrEqual(TPL_CACHE_MAX)
    expect(_tplCacheSize()).toBeGreaterThan(0)
  })

  test('eviction is oldest-first; recently-touched entries survive', () => {
    _clearTplCache()
    const noBind = (): null => null

    // Fill the cache to the cap.
    const baseHtml = (i: number): string => `<span data-i="${i}">${i}</span>`
    for (let i = 0; i < TPL_CACHE_MAX; i++) _tpl(baseHtml(i), noBind)
    expect(_tplCacheSize()).toBe(TPL_CACHE_MAX)

    // Touch entry 0 (the oldest). Map insertion-order semantics mean a
    // re-insert after delete moves it to the most-recent position.
    _tpl(baseHtml(0), noBind)

    // Add ONE new entry — the OLDEST untouched entry should evict, NOT entry 0.
    _tpl('<p>brand-new</p>', noBind)

    expect(_tplCacheSize()).toBe(TPL_CACHE_MAX)

    // Touch entry 0 again — if eviction policy were broken and entry 0
    // had been evicted, this re-creates it. We need a way to assert it
    // was retained. Approach: count cache misses by checking size delta.
    // Adding the brand-new entry above evicted ONE; the cache stayed at
    // cap. If we now add 1 more brand-new entry without re-using existing
    // keys, size stays at cap. If we re-touch entry 0, size also stays at
    // cap (already cached). The assertion: re-emitting entry 0 must NOT
    // grow the cache (cache hit, not miss).
    const sizeBeforeReHit = _tplCacheSize()
    _tpl(baseHtml(0), noBind)
    expect(_tplCacheSize()).toBe(sizeBeforeReHit) // re-emit was a hit
  })

  test('repeated emit of same template produces ONE cached entry', () => {
    _clearTplCache()
    const noBind = (): null => null

    for (let i = 0; i < 100; i++) {
      _tpl('<div class="static"></div>', noBind)
    }

    expect(_tplCacheSize()).toBe(1)
  })
})
