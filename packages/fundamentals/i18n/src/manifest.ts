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
        'Calling the plural suffix directly — `t("items_one")` bypasses selection. Call the BASE key with a `count`: `t("items", { count: 3 })`; the `_one`/`_other`/… suffix is chosen by the CLDR plural CATEGORY of `count` for the current locale.',
        'Defining only `_one`/`_other` for every language — the plural category is locale-specific (`Intl.PluralRules`), not `count === 1`. Slavic locales need `_few`/`_many`, Arabic needs `_zero`/`_two`; a locale missing its required category falls through to `_other`. Provide the per-locale keys (or a custom `pluralRules`).',
        '`count` is the RESERVED key that drives pluralization — passing the number under any other name (`n`, `num`, `value`) interpolates it but does NOT pluralize. Use `{ count }`.',
      ],
      seeAlso: ['I18nProvider', 'useI18n', 'Trans', 'interpolate', 'n', 'd', 'rt', 'resolvePluralCategory'],
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
      mistakes: [
        'The prop is `value` — `<I18nProvider value={i18n}>`, NOT `i18n={…}` / `instance={…}`. A wrong prop name leaves the context null and every `useI18n()` below throws.',
        'Importing it from `@pyreon/i18n/core` — the provider (and `useI18n` / `Trans`) is JSX and lives ONLY in the full `@pyreon/i18n` entry; `/core` is framework-agnostic.',
      ],
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
      mistakes: [
        'Calling it with no `<I18nProvider>` ancestor — it THROWS (`useI18n() must be used within an <I18nProvider>`); the context default is null. Wrap the tree in a provider.',
        'Destructuring `{ locale }` and reading it as a value — `locale` is a SIGNAL; call `locale()` to read (and track) the current locale, and `locale.set("fr")` to change it. Destructuring the instance itself is fine — `t`/`n`/`d`/`rt` are stable bound functions (this is NOT the reactive-props destructure trap).',
      ],
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
      signature:
        '(template: string, values?: InterpolationValues, options?: { format?: (value: unknown, spec: string) => string }) => string',
      summary:
        'Pure string interpolation — replaces `{{name}}` placeholders with values from the map (ReDoS-safe single-pass regex). Available from both entries. Use directly when you need interpolation without the full i18n instance (e.g. server-side email templates). The optional `options.format` resolver handles inline `{{val, spec}}` specs — the i18n instance supplies one bound to its locale + formatters; a bare call has none.',
      example: `interpolate('Hello, {{name}}!', { name: 'World' })  // 'Hello, World!'`,
      mistakes: [
        'Expecting a missing value to blank the placeholder — an `undefined`/absent value leaves the LITERAL `{{key}}` in the output (not an empty string). Make the `values` keys match the placeholders.',
        'Expecting bare `interpolate()` to FORMAT inline specs — without `options.format`, `interpolate("{{amount, currency}}", { amount: 9.99 })` returns `"9.99"` (unformatted); the spec is ignored. Use `i18n.t()` (which binds the locale-aware formatter) for `{{amount, currency}}`-style output.',
        'Expecting arbitrary placeholder text — only a single `{{word}}` token (`\\w+`) is a placeholder; `{{not a key}}` (spaces/punctuation) is left literal by design. Object values are `JSON.stringify`d; a non-serializable value renders the raw placeholder + a dev warning.',
      ],
      seeAlso: ['createI18n', 'resolvePluralCategory', 'parseRichText'],
    },
    {
      name: 'resolvePluralCategory',
      kind: 'function',
      signature: '(locale: string, count: number, customRules?: PluralRules) => string',
      summary:
        'Resolve the CLDR plural category for a `count` in a `locale` — returns one of `"zero"` / `"one"` / `"two"` / `"few"` / `"many"` / `"other"`. Uses `customRules[locale](count)` if provided, else a per-locale-memoized `Intl.PluralRules` (construction is the dominant cost; `.select()` is cheap), falling back to `count === 1 ? "one" : "other"` only when `Intl.PluralRules` is unavailable. Exported from both `@pyreon/i18n` and `@pyreon/i18n/core`; it is the primitive `t()` uses internally to pick a `_one`/`_other`/… suffix.',
      example: `resolvePluralCategory('en', 1)   // "one"
resolvePluralCategory('en', 5)   // "other"
resolvePluralCategory('ru', 2)   // "few"  (Russian)
resolvePluralCategory('ar', 0)   // "zero" (Arabic)`,
      mistakes: [
        'Treating the return as a count-based boolean — it is a locale-specific CLDR CATEGORY, not `count === 1`. English collapses to one/other, but Russian/Arabic/Polish return few/many/two/zero; branch on the returned string, do not re-derive from `count`.',
        'Assuming the same categories across locales — `resolvePluralCategory("en", 0)` is `"other"` while `resolvePluralCategory("ar", 0)` is `"zero"`. Design your message keys around the categories the TARGET locale actually produces.',
      ],
      seeAlso: ['createI18n'],
    },
    {
      name: 'parseRichText',
      kind: 'function',
      signature: '(text: string) => (string | { tag: string; children: string })[]',
      summary:
        'The low-level parser behind `<Trans>` — splits a translated string into an array of plain-text segments and `{ tag, children }` rich parts, matching flat `<tag>content</tag>` runs (regex `/<(\\w+)>([^<]*)<\\/\\1>/g`). Exported for advanced callers that map rich segments to something other than JSX (e.g. terminal ANSI, a native renderer). Most apps should use `<Trans>` instead.',
      example: `parseRichText("Hello <bold>world</bold>, <link>here</link>")
// ["Hello ", { tag: "bold", children: "world" }, ", ", { tag: "link", children: "here" }]`,
      mistakes: [
        'Expecting NESTED tags to parse — the children class is `[^<]*`, so `<b><i>x</i></b>` does NOT match as a nested structure; keep rich tags flat and non-overlapping.',
        'Using hyphenated tags or attributes — tag names are `\\w+` only; `<my-tag>` / `<a href="…">` won\'t match. Use plain single-word tags (`<link>`, `<bold>`) and map them in `<Trans components>`.',
        'Reaching for it when `<Trans>` suffices — `parseRichText` returns data, not VNodes; `<Trans>` does the parse AND the component mapping. Use this only for non-JSX render targets.',
      ],
      seeAlso: ['Trans', 'interpolate'],
    },
    {
      name: 'MessageKeys',
      kind: 'type',
      signature: 'type MessageKeys<M> // dot-path key union of a messages object, plural suffixes collapsed',
      summary:
        "The dot-path key union of a messages object — every translatable key, nested keys joined with '.', plural suffixes (_one/_other/_zero/_two/_few/_many) COLLAPSED to their base key (you call `t('items', { count })`, not `t('items_one')`). Recursion is depth-capped at 6 nesting levels; over an index-signature `TranslationDictionary` it degrades gracefully to `string`. Foundation of the opt-in typed instance: `createI18n<typeof en>(...)`. Type-only, zero runtime bytes.",
      example: `const en = {
  greeting: 'Hello {{name}}',
  nav: { home: 'Home', about: 'About' },
  items_one: '{{count}} item',
  items_other: '{{count}} items',
} as const
type Keys = MessageKeys<typeof en> // 'greeting' | 'nav.home' | 'nav.about' | 'items'`,
      mistakes: [
        "MessageKeys over a messages object TYPED as `TranslationDictionary` (or any index signature) gives `string` — the literal keys are erased; pass `typeof en` of a literal object (values may widen, keys survive without `as const`; params extraction needs `as const`)",
        "Raw plural-suffixed keys ('items_one') are deliberately NOT in the union — call the BASE key with `{ count }` and the runtime picks the form",
        'Namespaced keys ("auth:errors.invalid") are not derivable — namespaces load at runtime; the typed instance accepts any `ns:key` string unchecked',
        'A legit key that merely ENDS in a plural suffix (`phase_one`) collapses too — rename it if that is unwanted',
        'Trees deeper than 6 levels contribute no keys past the cap (documented recursion guard) — flatten pathological nesting',
      ],
      seeAlso: ['TranslationParams', 'TypedTranslationKey', 'createI18n'],
    },
    {
      name: 'TranslationParams',
      kind: 'type',
      signature: 'type TranslationParams<M, K extends string> // {{param}} names of the message at key K',
      summary:
        "Derive the interpolation params of ONE message: the `{{param}}` names in the message literal (inline format specs like `{{amount, currency}}` contribute the name before the comma), plus `count: number` when the key resolves through plural suffixes. Requires LITERAL message values (`as const`) — over widened `string` values it degrades to the loose `InterpolationValues` record. Type-only, zero runtime bytes.",
      example: `const en2 = { greeting: 'Hi {{name}}', items_other: '{{count}} items' } as const
type P1 = TranslationParams<typeof en2, 'greeting'> // { name: InterpolationValue }
type P2 = TranslationParams<typeof en2, 'items'>    // { count: number }`,
      mistakes: [
        'Without `as const` the message VALUES widen to `string` and params degrade to `InterpolationValues` — the literal is what carries the `{{param}}` names',
        'It derives from ONE locale\'s messages — a param present only in another locale\'s translation is invisible; keep placeholder parity across locales',
        'Unknown keys degrade to `InterpolationValues` rather than erroring — pair with `MessageKeys` for key checking',
      ],
      seeAlso: ['MessageKeys', 'createI18n'],
    },
    {
      name: 'TypedTranslationKey',
      kind: 'type',
      signature: 'type TypedTranslationKey<M> // MessageKeys<M> | `${string}:${string}`, degrading to string',
      summary:
        "The key type a TYPED i18n instance accepts: the derived `MessageKeys` union PLUS any `namespace:key` string (namespaced lookups stay unchecked — namespaces load at runtime). This is what `createI18n<typeof en>()` plugs into `I18nInstance<TKey>`; when the messages type carries no literal keys it degrades to plain `string`, so untyped usage is byte-identical. Type-only, zero runtime bytes.",
      example: `const en3 = { nav: { home: 'Home' } } as const
const i18n = createI18n<typeof en3>({ locale: 'en', messages: { en: en3 } })
i18n.t('nav.home')          // ✓ autocompleted + checked
i18n.t('auth:errors.bad')   // ✓ namespaced — unchecked by design`,
      mistakes: [
        'Expecting namespaced keys to be typo-checked — any `ns:key` string is accepted (runtime-loaded namespaces cannot be enumerated at compile time)',
        'Reading a typed instance back through `useI18n()` — context erases the key type (returns `I18nInstance<string>`); keep a module-level typed instance for typed `t`',
      ],
      seeAlso: ['MessageKeys', 'createI18n', 'useI18n'],
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
