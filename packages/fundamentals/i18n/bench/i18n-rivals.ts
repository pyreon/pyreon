/**
 * @pyreon/i18n vs i18next, FormatJS, vue-i18n, Lingui and Paraglide.
 *
 * Run: `bun run bench:rivals` (from packages/fundamentals/i18n). Harness and
 * measurement contract: `scripts/bench/rivals-harness.ts` (one process per
 * op × arm × round, cluster-bootstrap CI95 over processes, gate before timing).
 *
 * Every arm renders the SAME five strings (the gate compares them byte for
 * byte, so an arm that skips the work fails it):
 *   t plain        "Hello there, friend"
 *   interpolation  "Hello Ada, welcome back"
 *   plural         "<n> item(s) in your cart"   (n cycles 1..500 in every arm)
 *   number         "Total: 1,234.5"
 *   date           "Updated Jan 15, 2026"        (dateStyle medium in every arm)
 * The count stays below 1,000 because ICU `#` (FormatJS, Lingui) formats it
 * with grouping and the `{{count}}` / `{count}` arms do not; above 999 the
 * outputs would differ.
 *
 * Each arm follows its library's documented production path:
 *  - Pyreon: `createI18n({ locale, messages })` + `t(key, values)`.
 *  - i18next: `createInstance().init(...)` + `t`; `escapeValue: false`, as in
 *    `i18n-bench.ts` (i18next escapes by default, Pyreon does not — this hands
 *    i18next its faster path). Date via the built-in `datetime(dateStyle:
 *    medium)` formatter. https://www.i18next.com/translation-function/formatting
 *  - FormatJS: `createIntl({ locale, messages }, createIntlCache())` +
 *    `intl.formatMessage({ id }, values)`, with messages PRE-PARSED to AST the
 *    way `formatjs compile --ast` emits them (FormatJS's documented
 *    production recommendation).
 *    https://formatjs.github.io/docs/intl · https://formatjs.github.io/docs/guides/advanced-usage#pre-parsing-messages
 *  - vue-i18n: `createI18n({ legacy: false, ... })` and `i18n.global.t` / `n` /
 *    `d` (the composition-mode global scope, usable outside components).
 *    Message functions are compiled on first use and cached (JIT compilation,
 *    the v10+ default); number and date go through `n()` / `d()` and are
 *    passed into the message, because vue-i18n messages have no inline
 *    number/date formatter. https://vue-i18n.intlify.dev/guide/essentials/number
 *  - Lingui: `setupI18n({ locale, messages })` + `i18n._(id, values)` with
 *    messages compiled by `compileMessage` from `@lingui/message-utils` — the
 *    function `lingui compile` runs to produce the catalogs a production app
 *    loads. https://lingui.dev/ref/core · https://lingui.dev/ref/cli#compile
 *  - Paraglide: the compiled message functions `m.<key>(inputs)` in
 *    `bench/paraglide/compiled/`. Paraglide is a compiler; its compiled output
 *    IS its production path, so this arm times generated code, not a runtime
 *    lookup by key. Committed output of (from `bench/paraglide/`):
 *      bunx @inlang/paraglide-js@3.2.1 compile --project ./project.inlang \
 *        --outdir ./compiled --strategy globalVariable baseLocale \
 *        --is-server false --is-development false --output-structure locale-modules \
 *        --no-emit-readme --no-emit-git-ignore --no-emit-prettier-ignore --no-emit-ts-declarations
 *    (`globalVariable baseLocale` is the documented in-memory client strategy;
 *    `--is-development false` is the production output.)
 *    https://paraglidejs.com/strategy · https://paraglidejs.com/formatting
 *
 * Disclosures: Pyreon's `t` reads a reactive locale signal on every call; the
 * others read a plain field (Paraglide resolves its strategy per call).
 * Paraglide's per-message functions need no key lookup at all.
 */
import i18next from 'i18next'
import { createIntl, createIntlCache } from '@formatjs/intl'
import { parse } from '@formatjs/icu-messageformat-parser'
import { setupI18n } from '@lingui/core'
import { compileMessage } from '@lingui/message-utils/compileMessage'
import { createI18n as createVueI18n } from 'vue-i18n'
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'
import { createI18n } from '../src/index'
import { m } from './paraglide/compiled/messages.js'

type Id = 'pyreon' | 'i18next' | 'formatjs' | 'vue-i18n' | 'lingui' | 'paraglide'
const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: 'Pyreon' },
  { id: 'i18next', label: 'i18next', pkg: 'i18next' },
  { id: 'formatjs', label: 'FormatJS (@formatjs/intl)', pkg: '@formatjs/intl' },
  { id: 'vue-i18n', label: 'vue-i18n', pkg: 'vue-i18n' },
  { id: 'lingui', label: 'Lingui (@lingui/core)', pkg: '@lingui/core' },
  { id: 'paraglide', label: 'Paraglide (compiled 3.2.1)' },
]

const DATE = new Date(Date.UTC(2026, 0, 15, 9, 30))
const PRICE = 1234.5
let sink = 0

// ─── one fixture per library (built lazily: a child builds only its arm) ─────
type Api = {
  plain: () => string
  hello: (name: string) => string
  items: (count: number) => string
  price: (val: number) => string
  when: (val: Date) => string
}

async function build(id: Id): Promise<Api> {
  switch (id) {
    case 'pyreon': {
      const i18n = createI18n({
        locale: 'en',
        messages: {
          en: {
            greeting: 'Hello there, friend',
            hello: 'Hello {{name}}, welcome back',
            items_one: '{{count}} item in your cart',
            items_other: '{{count}} items in your cart',
            price: 'Total: {{val, number}}',
            when: 'Updated {{val, date}}',
          },
        },
      })
      return {
        plain: () => i18n.t('greeting'),
        hello: (name) => i18n.t('hello', { name }),
        items: (count) => i18n.t('items', { count }),
        price: (val) => i18n.t('price', { val }),
        when: (val) => i18n.t('when', { val }),
      }
    }
    case 'i18next': {
      const i = i18next.createInstance()
      await i.init({
        lng: 'en',
        resources: {
          en: {
            translation: {
              greeting: 'Hello there, friend',
              hello: 'Hello {{name}}, welcome back',
              items_one: '{{count}} item in your cart',
              items_other: '{{count}} items in your cart',
              price: 'Total: {{val, number}}',
              when: 'Updated {{val, datetime(dateStyle: medium)}}',
            },
          },
        },
        interpolation: { escapeValue: false },
      })
      return {
        plain: () => i.t('greeting'),
        hello: (name) => i.t('hello', { name }),
        items: (count) => i.t('items', { count }),
        price: (val) => i.t('price', { val }),
        when: (val) => i.t('when', { val }),
      }
    }
    case 'formatjs': {
      const ast = Object.fromEntries(Object.entries(ICU).map(([k, v]) => [k, parse(v)]))
      const intl = createIntl({ locale: 'en', messages: ast }, createIntlCache())
      return {
        plain: () => intl.formatMessage({ id: 'greeting' }),
        hello: (name) => intl.formatMessage({ id: 'hello' }, { name }),
        items: (count) => intl.formatMessage({ id: 'items' }, { count }),
        price: (val) => intl.formatMessage({ id: 'price' }, { val }),
        when: (val) => intl.formatMessage({ id: 'when' }, { val }),
      }
    }
    case 'vue-i18n': {
      const i18n = createVueI18n({
        legacy: false,
        locale: 'en',
        messages: {
          en: {
            greeting: 'Hello there, friend',
            hello: 'Hello {name}, welcome back',
            items: 'no items | {count} item in your cart | {count} items in your cart',
            price: 'Total: {val}',
            when: 'Updated {val}',
          },
        },
        datetimeFormats: { en: { medium: { dateStyle: 'medium' } } },
      })
      const { t, n, d } = i18n.global
      return {
        plain: () => t('greeting'),
        hello: (name) => t('hello', { name }),
        items: (count) => t('items', count),
        price: (val) => t('price', { val: n(val) }),
        when: (val) => t('when', { val: d(val, 'medium') }),
      }
    }
    case 'lingui': {
      const compiled = Object.fromEntries(
        Object.entries({ ...ICU, when: 'Updated {val, date}' }).map(([k, v]) => [k, compileMessage(v)]),
      )
      const i18n = setupI18n({ locale: 'en', messages: { en: compiled } })
      return {
        plain: () => i18n._('greeting'),
        hello: (name) => i18n._('hello', { name }),
        items: (count) => i18n._('items', { count }),
        price: (val) => i18n._('price', { val }),
        when: (val) => i18n._('when', { val }),
      }
    }
    case 'paraglide':
      return {
        plain: () => m.greeting(),
        hello: (name) => m.hello({ name }),
        items: (count) => m.items({ count }),
        price: (val) => m.price({ val }),
        when: (val) => m.when({ val }),
      }
  }
}

// ICU MessageFormat catalog shared by FormatJS and Lingui.
const ICU = {
  greeting: 'Hello there, friend',
  hello: 'Hello {name}, welcome back',
  items: '{count, plural, one {# item in your cart} other {# items in your cart}}',
  price: 'Total: {val, number}',
  when: 'Updated {val, date, medium}',
}

const NAMES = ['Ada', 'Grace', 'Linus', 'Barbara']

await runRivalBench<Id>({
  title: '@pyreon/i18n vs i18next / FormatJS / vue-i18n / Lingui / Paraglide',
  file: import.meta.path,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  ops: {
    't (plain lookup)': {
      make: async (id) => {
        const api = await build(id)
        return () => {
          sink += api.plain().length
        }
      },
    },
    'interpolation {name}': {
      make: async (id) => {
        const api = await build(id)
        let i = 0
        return () => {
          sink += api.hello(NAMES[i++ & 3] as string).length
        }
      },
    },
    'plural {count}': {
      make: async (id) => {
        const api = await build(id)
        let i = 0
        return () => {
          sink += api.items((i++ % 500) + 1).length
        }
      },
    },
    'number {val, number}': {
      note: 'vue-i18n formats with n() and passes the string in (no inline number formatter in its message syntax)',
      make: async (id) => {
        const api = await build(id)
        return () => {
          sink += api.price(PRICE).length
        }
      },
    },
    'date {val, date}': {
      note: 'dateStyle medium in every arm; vue-i18n formats with d() and passes the string in',
      make: async (id) => {
        const api = await build(id)
        return () => {
          sink += api.when(DATE).length
        }
      },
    },
  },
  gate: async () => {
    const expected: [string, (a: Api) => string][] = [
      ['Hello there, friend', (a) => a.plain()],
      ['Hello Ada, welcome back', (a) => a.hello('Ada')],
      ['1 item in your cart', (a) => a.items(1)],
      ['5 items in your cart', (a) => a.items(5)],
      ['500 items in your cart', (a) => a.items(500)],
      ['Total: 1,234.5', (a) => a.price(PRICE)],
      ['Updated Jan 15, 2026', (a) => a.when(DATE)],
    ]
    for (const arm of ARMS) {
      const api = await build(arm.id)
      for (const [want, call] of expected) {
        const got = call(api)
        if (got !== want) throw new Error(`[correctness] ${arm.label}: expected "${want}", got "${got}"`)
      }
    }
  },
  footnotes: [
    'Every arm returns byte-identical strings (gate above). Paraglide times compiled per-message functions (its production path), so it does no key lookup.',
  ],
})
