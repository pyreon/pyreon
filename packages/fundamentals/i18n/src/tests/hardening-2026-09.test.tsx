import { h } from '@pyreon/core'
import { vi } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { createI18n } from '../create-i18n'
import { resolvePluralCategory, _pluralRulesCacheSize } from '../pluralization'
import { Trans } from '../trans'

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

// ─── 1. <Trans> — values can never become tags ──────────────────────────────

describe('<Trans> — interpolated values are text, never markup', () => {
  const i18n = createI18n({
    locale: 'en',
    messages: { en: { msg: 'Hi <bold>{{name}}</bold>, see <link>docs</link>' } },
  })
  const components = {
    bold: (c: unknown) => h('strong', null, c as string),
    link: (c: unknown) => h('a', { href: '/docs', 'data-link': '' }, c as string),
  }

  it('a value carrying a closing + opening tag does not invoke a component', () => {
    const el = container()
    mount(
      h(Trans, {
        t: i18n.t,
        i18nKey: 'msg',
        values: { name: 'x</bold><link>pwn</link><bold>y' },
        components,
      }),
      el,
    )
    // Exactly the ONE link the template declares — the value created none.
    expect(el.querySelectorAll('[data-link]').length).toBe(1)
    expect(el.querySelector('strong')?.textContent).toBe('x</bold><link>pwn</link><bold>y')
    el.remove()
  })

  it('a value with angle brackets renders verbatim outside tags too', () => {
    const t2 = createI18n({ locale: 'en', messages: { en: { m: 'A {{v}} <b>B</b>' } } })
    const el = container()
    mount(
      h(Trans, {
        t: t2.t,
        i18nKey: 'm',
        values: { v: '<b>not bold</b>' },
        components: { b: (c: unknown) => h('b', null, c as string) },
      }),
      el,
    )
    expect(el.querySelectorAll('b').length).toBe(1)
    expect(el.textContent).toBe('A <b>not bold</b> B')
    el.remove()
  })

  it('reserved keys (count/context) still drive plural + context selection', () => {
    const t3 = createI18n({
      locale: 'en',
      messages: { en: { items_one: '<b>{{count}}</b> item', items_other: '<b>{{count}}</b> items' } },
    })
    const el = container()
    mount(
      h(Trans, {
        t: t3.t,
        i18nKey: 'items',
        values: { count: 3 },
        components: { b: (c: unknown) => h('b', null, c as string) },
      }),
      el,
    )
    expect(el.innerHTML).toContain('<b>3</b> items')
    el.remove()
  })

  it('components are looked up as OWN keys only', () => {
    const t4 = createI18n({ locale: 'en', messages: { en: { m: 'a <toString>x</toString>' } } })
    const el = container()
    mount(h(Trans, { t: t4.t, i18nKey: 'm', components: {} }), el)
    expect(el.textContent).toBe('a x')
    el.remove()
  })
})

// ─── 2. Loader namespaces are normalized ────────────────────────────────────

describe('loadNamespace — flat keys + sanitizing clone', () => {
  it('a loader returning flat dotted keys resolves them', async () => {
    const i18n = createI18n({
      locale: 'en',
      loader: async () => ({ 'nav.top': 'Top', plain: 'P' }),
    })
    await i18n.loadNamespace('site')
    expect(i18n.t('site:nav.top')).toBe('Top')
    expect(i18n.t('site:plain')).toBe('P')
  })

  it('a loaded dict is cloned — mutating the source after load does not change translations', async () => {
    const src: Record<string, unknown> = { nested: { a: 'A' } }
    const i18n = createI18n({ locale: 'en', loader: async () => src as never })
    await i18n.loadNamespace('ns')
    ;(src.nested as Record<string, string>).a = 'MUTATED'
    expect(i18n.t('ns:nested.a')).toBe('A')
  })

  it('a polluting loader payload does not reach Object.prototype', async () => {
    const payload = JSON.parse('{"__proto__": {"polluted": "yes"}, "a": {"__proto__": {"p2": "yes"}}}')
    const i18n = createI18n({ locale: 'en', loader: async () => payload })
    await i18n.loadNamespace('x')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).p2).toBeUndefined()
  })
})

// ─── 3. BCP 47 step-down ────────────────────────────────────────────────────

describe('locale step-down — en-US → en → fallbackLocale', () => {
  it('a region locale resolves from its base language', () => {
    const i18n = createI18n({
      locale: 'en-US',
      fallbackLocale: 'de',
      messages: { en: { hi: 'Hello' }, de: { hi: 'Hallo', only: 'Nur' } },
    })
    expect(i18n.t('hi')).toBe('Hello')
    expect(i18n.t('only')).toBe('Nur')
  })

  it('the most specific locale wins, and a script subtag steps down twice', () => {
    const i18n = createI18n({
      locale: 'zh-Hant-TW',
      messages: { 'zh-Hant': { a: 'Hant' }, zh: { a: 'zh', b: 'zh-b' } },
    })
    expect(i18n.t('a')).toBe('Hant')
    expect(i18n.t('b')).toBe('zh-b')
  })

  it('the fallback locale steps down as well, and exists() follows the chain', () => {
    const i18n = createI18n({
      locale: 'fr',
      fallbackLocale: 'en-GB',
      messages: { en: { colour: 'colour' } },
    })
    expect(i18n.t('colour')).toBe('colour')
    expect(i18n.exists('colour')).toBe(true)
    expect(i18n.exists('nope')).toBe(false)
  })
})

// ─── 4. Own-property lookups ─────────────────────────────────────────────────

describe('inherited members are never translations, formats or plural rules', () => {
  it('a key path walking into Object.prototype resolves to missing', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { a: { b: 'B' } } } })
    expect(i18n.t('a.constructor.name')).toBe('a.constructor.name')
    expect(i18n.t('toString')).toBe('toString')
    expect(i18n.exists('a.constructor.name')).toBe(false)
  })

  it('an inline format spec named after an inherited member is plain coercion', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { m: '{{v, toString}} {{v, constructor}}' } },
      numberFormats: { en: {} },
      formats: {},
    })
    expect(i18n.t('m', { v: 5 })).toBe('5 5')
  })

  it('custom plural rules are consulted for own locales only', () => {
    expect(resolvePluralCategory('toString', 1, {})).toBe('one')
    expect(resolvePluralCategory('constructor', 2, {})).toBe('other')
  })
})

// ─── 5. $t nesting does not re-interpolate resolved text ────────────────────

describe('$t() nesting — a nested result is final text', () => {
  it('a value that looks like a placeholder is not interpolated a second time', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { outer: 'Say: $t(inner)', inner: 'hi {{name}}' } },
    })
    expect(i18n.t('outer', { name: '{{secret}}', secret: 'LEAK' })).toBe('Say: hi {{secret}}')
  })

  it('placeholders in the outer template are still interpolated', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { outer: '{{a}} $t(inner) {{b}}', inner: '[{{a}}]' } },
    })
    expect(i18n.t('outer', { a: 'A', b: 'B' })).toBe('A [A] B')
  })
})

// ─── 6. Bounded plural-rules cache ───────────────────────────────────────────

describe('Intl.PluralRules cache is bounded', () => {
  it('a flood of distinct locale strings does not grow the cache without limit', () => {
    for (let i = 0; i < 500; i++) resolvePluralCategory(`en-x-p${i}`, 2)
    expect(_pluralRulesCacheSize()).toBeLessThanOrEqual(64)
    expect(resolvePluralCategory('en', 1)).toBe('one')
  })
})

// ─── 7. Resolution cache is an LRU, not a stop-caching cap ──────────────────

describe('resolution cache evicts instead of freezing', () => {
  it('keeps caching new keys after 2000 distinct lookups', () => {
    const messages: Record<string, string> = {}
    for (let i = 0; i < 2100; i++) messages[`k${i}`] = `v${i}`
    const i18n = createI18n({ locale: 'en', messages: { en: messages } })
    for (let i = 0; i < 2050; i++) i18n.t(`k${i}`)
    const counts: string[] = []
    const g = globalThis as { __pyreon_count__?: ((n: string) => void) | undefined }
    const prev = g.__pyreon_count__
    g.__pyreon_count__ = (n) => {
      if (n === 'i18n.lookupKey') counts.push(n)
    }
    try {
      i18n.t('k2080') // first time → resolves
      i18n.t('k2080') // must now be a cache hit
    } finally {
      g.__pyreon_count__ = prev
    }
    expect(counts.length).toBe(1)
  })
})

describe('<Trans> — object and non-string values', () => {
  const tr = createI18n({ locale: 'en', messages: { en: { m: '<b>{{o}}</b> {{d}} {{n}}' } } })
  const comps = { b: (c: unknown) => h('b', null, c as string) }
  const render = (values: Record<string, unknown>) => {
    const el = container()
    mount(h(Trans, { t: tr.t, i18nKey: 'm', values: values as never, components: comps }), el)
    const out = { html: el.innerHTML, text: el.textContent, bs: el.querySelectorAll('b').length }
    el.remove()
    return out
  }

  it('an object value containing angle brackets is escaped, not parsed', () => {
    const r = render({ o: { x: '</b><b>' }, d: new Date(0), n: 1 })
    expect(r.bs).toBe(1)
    expect(r.text).toContain('{"x":"</b><b>"}')
  })

  it('an object value without brackets stays an object (JSON by interpolate)', () => {
    expect(render({ o: { x: 1 }, d: 'd', n: 2 }).text).toContain('{"x":1}')
  })

  it('an unserializable object value is left to interpolate', () => {
    const circ: Record<string, unknown> = {}
    circ.self = circ
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(render({ o: circ, d: 'd', n: 3 }).text).toContain('{{o}}')
    warn.mockRestore()
  })
})

describe('plural rules — own non-function entries and cache recency', () => {
  it('an own non-function rule falls through to Intl', () => {
    expect(resolvePluralCategory('en', 1, { en: 'nope' as never })).toBe('one')
  })

  it('a cache hit refreshes recency', () => {
    resolvePluralCategory('fr', 1)
    resolvePluralCategory('de', 1)
    expect(resolvePluralCategory('fr', 2)).toBe('other')
  })
})
