import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/i18n',
  title: 'Internationalization',
  tagline:
    'Reactive i18n with Intl number/date/relative-time formatting, plurals, interpolation, async namespaces',
  description:
    'Signal-based internationalization for Pyreon. `createI18n` returns a reactive `t(key, values?)` plus locale-reactive `Intl` formatters `n()` (number/currency/percent), `d()` (date/time) and `rt()` (relative time) — formatters are memoized per (locale, options). Translations support `{{name}}` interpolation, inline format specifiers (`{{amount, currency}}`, `{{when, date}}`, `{{n, relativetime, day}}`), `_one`/`_other`/`_zero` plural suffixes, `context` (gender/variant), `defaultValue`, and `$t(key)` nesting. Namespace lazy loading deduplicates concurrent requests. Two entry points: `@pyreon/i18n` (full — includes JSX `Trans` component, `I18nProvider`, `useI18n`) and `@pyreon/i18n/core` (framework-agnostic — only `createI18n`, `interpolate`, `resolvePluralCategory`, types). The `/core` entry transitively depends only on `@pyreon/reactivity` with zero JSX, making it suitable for backend translation pipelines, edge workers, and non-Pyreon frontends.',
  category: 'universal',
  longExample: `import { createI18n, I18nProvider, useI18n, Trans } from '@pyreon/i18n'

// Create an i18n instance with initial messages:
const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: {
      greeting: 'Hello, {{name}}!',
      items_one: '{{count}} item',
      items_other: '{{count}} items',
    },
    fr: {
      greeting: 'Bonjour, {{name}} !',
      items_one: '{{count}} article',
      items_other: '{{count}} articles',
    },
  },
  // Async namespace loading — deduplicates concurrent requests:
  loader: (locale, ns) => import(\`./locales/\${locale}/\${ns}.json\`),
})

// Use the t() function — reactive, re-evaluates on locale change:
i18n.t('greeting', { name: 'World' })  // "Hello, World!"
i18n.t('items', { count: 3 })          // "3 items" (pluralized)

// Intl formatters (reactive to locale, memoized per options):
i18n.n(1234.5)                                 // "1,234.5"
i18n.n(9.99, { style: 'currency', currency: 'USD' })  // "$9.99"
i18n.d(Date.now(), { dateStyle: 'medium' })    // "Jan 15, 2024"
i18n.rt(-3, 'day')                             // "3 days ago"

// Inline format specifiers + context/defaultValue inside t():
// messages.en.total = "Total: {{amount, currency}}"  → "Total: $9.99"
i18n.t('total', { amount: 9.99 })
i18n.t('friend', { context: 'female' })        // tries "friend_female"
i18n.t('missing', { defaultValue: 'Fallback' })// "Fallback"

// Switch locale reactively:
i18n.locale.set('fr')
i18n.t('greeting', { name: 'Monde' })  // "Bonjour, Monde !"

// Add messages at runtime:
i18n.addMessages('en', { farewell: 'Goodbye!' })

// Context pattern — provide to component tree:
const App = () => (
  <I18nProvider value={i18n}>
    <Page />
  </I18nProvider>
)

// Consume in child components:
const Page = () => {
  const { t, locale } = useI18n()
  return (
    <div>
      {t('greeting', { name: 'User' })}
      {/* message "rich": "This has <bold>rich text</bold> inside." */}
      {/* t is read from <I18nProvider> automatically — no t={t} needed */}
      <Trans i18nKey="rich" components={{ bold: (c) => <strong>{c}</strong> }} />
    </div>
  )
}

// Backend / non-JSX entry — @pyreon/i18n/core
// Zero JSX, zero @pyreon/core — only @pyreon/reactivity
import { createI18n as createCoreI18n, interpolate } from '@pyreon/i18n/core'
const backend = createCoreI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
backend.t('hello')  // 'Hi'
interpolate('Hello, {{name}}!', { name: 'Server' })  // 'Hello, Server!'`,
  features: [
    'createI18n with reactive t(key, values?) — re-evaluates on locale change',
    'Locale-reactive Intl formatters: n() number/currency/percent, d() date/time, rt() relative time (memoized per locale)',
    'Inline format specifiers: {{amount, currency}}, {{when, date}}, {{n, relativetime, day}} + custom named formats',
    '{{name}} interpolation, _one/_other/_zero plural suffixes, context (gender/variant), defaultValue, $t(key) nesting',
    'Async namespace loading with request deduplication',
    'I18nProvider / useI18n context pattern (Trans auto-reads t from context)',
    'Trans component for rich JSX interpolation',
    'Two entry points: full (JSX) and /core (framework-agnostic)',
    'Devtools subpath export with WeakRef-based registry',
  ],
  api: [
    {
      name: 'createI18n',
      kind: 'function',
      signature: '(options: I18nOptions) => I18nInstance',
      summary:
        'Create a reactive i18n instance. Returns `{ t, n, d, rt, locale, addMessages, loadNamespace, ... }`. The `t(key, values?)` function resolves translations reactively — changing `locale` via `.set()` re-evaluates all `t()`/`n()`/`d()`/`rt()` reads in reactive scopes. Supports `{{name}}` interpolation, inline format specifiers (`{{amount, currency}}`), `_one`/`_other`/`_zero` plural suffixes, `context` (gender/variant), `defaultValue`, `$t(key)` nesting, namespace lazy loading with deduplication, fallback locale, and custom plural rules. Configure named Intl formats via `numberFormats` / `dateFormats` / `relativeTimeFormats` and custom inline formatters via `formats`. Available from both `@pyreon/i18n` and `@pyreon/i18n/core`.',
      example: `const i18n = createI18n({
  locale: 'en',
  messages: { en: { greeting: 'Hello, {{name}}!' } },
  loader: (locale, ns) => import(\`./locales/\${locale}/\${ns}.json\`),
  fallbackLocale: 'en',
})

i18n.t('greeting', { name: 'World' })  // "Hello, World!"
i18n.locale.set('fr')  // switch reactively`,
      mistakes: [
        'Reading `t(key)` outside a reactive scope and expecting updates on locale change — `t()` is a reactive signal read, wrap in JSX thunk or `effect()`',
        'Using `@pyreon/i18n` on the backend — use `@pyreon/i18n/core` instead, it has zero JSX/core dependencies',
        'Forgetting `fallbackLocale` — missing keys in the current locale return the key string instead of falling back to another language',
      ],
      seeAlso: ['I18nProvider', 'useI18n', 'Trans', 'interpolate', 'n', 'd', 'rt'],
    },
    {
      name: 'n',
      kind: 'function',
      signature: '(value: number | bigint, options?: Intl.NumberFormatOptions | string) => string',
      summary:
        'Format a number for the current locale via `Intl.NumberFormat`. Reactive — re-runs on locale change. `options` is an `Intl.NumberFormatOptions` object OR the name of a configured `numberFormats` entry. The underlying formatter is memoized per (locale, options), so repeated calls in a list reuse one `Intl.NumberFormat`.',
      example: `i18n.n(1234.5)                                   // "1,234.5"
i18n.n(9.99, { style: 'currency', currency: 'USD' }) // "$9.99"
i18n.n(0.42, { style: 'percent' })               // "42%"
// named format from createI18n({ numberFormats: { en: { price: {...} } } })
i18n.n(9.99, 'price')`,
      mistakes: [
        'Calling `n()` outside a reactive scope and expecting it to re-format on locale change — like `t()`, it reads the locale signal, so read it inside JSX / effect / computed',
        'Re-creating an options object every render thinking it allocates a formatter each time — formatters are memoized by a stringified options key, so inline option objects are fine',
      ],
      seeAlso: ['createI18n', 'd', 'rt'],
    },
    {
      name: 'd',
      kind: 'function',
      signature: '(value: Date | number | string, options?: Intl.DateTimeFormatOptions | string) => string',
      summary:
        'Format a date for the current locale via `Intl.DateTimeFormat`. Accepts a `Date`, epoch-ms number, or parseable string. Reactive + memoized. `options` is an `Intl.DateTimeFormatOptions` object or a configured `dateFormats` name. The bare inline specs `date` / `time` / `datetime` map to sensible default styles.',
      example: `i18n.d(Date.now(), { dateStyle: 'medium' })  // "Jan 15, 2024"
i18n.d(post.publishedAt, 'short')            // named dateFormats entry
i18n.d('2024-01-15T12:00:00Z', { timeZone: 'UTC', dateStyle: 'long' })`,
      mistakes: [
        'Passing a value that `new Date()` cannot parse — guard upstream; an invalid date formats as "Invalid Date"',
        'Expecting a fixed timezone — without `timeZone` in options, formatting uses the runtime timezone (pass `timeZone: "UTC"` for deterministic SSR/test output)',
      ],
      seeAlso: ['createI18n', 'n', 'rt'],
    },
    {
      name: 'rt',
      kind: 'function',
      signature:
        '(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions | string) => string',
      summary:
        'Format a relative time for the current locale via `Intl.RelativeTimeFormat`. Reactive + memoized. Negative values are past, positive are future. Pass `{ numeric: "auto" }` for "yesterday"/"tomorrow" phrasing.',
      example: `i18n.rt(-3, 'day')                     // "3 days ago"
i18n.rt(2, 'hour')                     // "in 2 hours"
i18n.rt(-1, 'day', { numeric: 'auto' })// "yesterday"`,
      mistakes: [
        'Forgetting the unit argument — `rt` needs an explicit `Intl.RelativeTimeFormatUnit` (e.g. "day", "hour")',
        'Computing the delta in the wrong sign — negative is past ("ago"), positive is future ("in …")',
      ],
      seeAlso: ['createI18n', 'n', 'd'],
    },
    {
      name: 'I18nProvider',
      kind: 'component',
      signature: '(props: I18nProviderProps) => VNodeChild',
      summary:
        'Context provider that makes an i18n instance available to descendant components via `useI18n()`. Only available from the full `@pyreon/i18n` entry, not from `/core`.',
      example: `<I18nProvider value={i18n}>
  <App />
</I18nProvider>`,
      seeAlso: ['useI18n', 'createI18n'],
    },
    {
      name: 'useI18n',
      kind: 'hook',
      signature: '() => I18nInstance',
      summary:
        'Consume the nearest `I18nProvider` value. Returns the same `I18nInstance` with `t`, `locale`, `addMessages`, etc. Only available from the full `@pyreon/i18n` entry.',
      example: `const { t, locale } = useI18n()
return <div>{t('greeting', { name: 'User' })}</div>`,
      seeAlso: ['I18nProvider', 'createI18n'],
    },
    {
      name: 'Trans',
      kind: 'component',
      signature: '(props: TransProps) => VNodeChild',
      summary:
        'Rich text interpolation component. Translates `i18nKey` (with `values`) then maps `<tag>…</tag>` segments in the result to the `components` map, whose values are `(children) => VNode` functions. `t` is optional — when omitted, `<Trans>` reads the instance from the nearest `<I18nProvider>` via `useI18n()`. Use for translations that contain markup (bold, links, etc.) that cannot be expressed as plain string interpolation.',
      example: `// Message "action": "Please <link>click here</link> to continue"
// t is read from <I18nProvider> automatically:
<Trans i18nKey="action" components={{ link: (c) => <a href="/next">{c}</a> }} />`,
      mistakes: [
        'Using `key` instead of `i18nKey` — `key` is reserved by JSX for reconciliation and will not reach Trans',
        'Passing a VNode as a components value (`{ link: <a/> }`) — values must be functions `(children) => VNode`',
        'Rendering `<Trans>` outside an `<I18nProvider>` without a `t` prop — it throws; either wrap in a provider or pass `t`',
      ],
      seeAlso: ['createI18n', 'useI18n'],
    },
    {
      name: 'interpolate',
      kind: 'function',
      signature: '(template: string, values?: InterpolationValues) => string',
      summary:
        'Pure string interpolation — replaces `{{name}}` placeholders with values from the map. Available from both entries. Use directly when you need interpolation without the full i18n instance (e.g. server-side email templates).',
      example: `interpolate('Hello, {{name}}!', { name: 'World' })  // 'Hello, World!'`,
      seeAlso: ['createI18n'],
    },
  ],
  gotchas: [
    {
      label: 'Two entry points',
      note: '`@pyreon/i18n` includes JSX components (Trans, I18nProvider, useI18n) and depends on `@pyreon/core`. `@pyreon/i18n/core` is framework-agnostic with only `@pyreon/reactivity` as a dependency — use it for backends and edge workers.',
    },
    {
      label: 'Plural suffixes + _zero + context',
      note: 'Pluralization uses `_one`/`_other` key suffixes (e.g. `items_one`, `items_other`) selected by `count`. `count === 0` tries an explicit `_zero` form first (so English can say "No items"). `context` (gender/variant) combines with plurals: `t(key, { context: "male", count: 1 })` tries `key_male_one` → `key_male` → `key_one` → `key`. Custom plural rules can be provided for non-English languages.',
    },
    {
      label: 'Formatters are reactive + memoized',
      note: '`n()`/`d()`/`rt()` read the locale signal, so read them inside reactive scopes (JSX/effect) to re-format on locale change. The underlying `Intl.*Format` instances are memoized per (locale, options) — repeated calls in a rendered list are cheap. Configure reusable named formats via `numberFormats`/`dateFormats`/`relativeTimeFormats` and reference them by name (`n(9.99, "currency")`) or inline (`"{{amount, currency}}"`).',
    },
    {
      label: 'Reserved value keys',
      note: '`count`, `context`, and `defaultValue` in the `t()` values object are interpreted as options (not interpolated as `{{context}}` unless the translation literally references them). `defaultValue` is returned (interpolated) when the key is missing, before the key-as-fallback.',
    },
    {
      label: 'Namespace deduplication',
      note: 'Concurrent calls to `loadNamespace` for the same locale+namespace share a single fetch — the second call awaits the first, not a duplicate request.',
    },
    {
      label: 'Devtools',
      note: 'Import `@pyreon/i18n/devtools` for a WeakRef-based registry of live i18n instances. Tree-shakeable — zero cost unless imported.',
    },
  ],
})
