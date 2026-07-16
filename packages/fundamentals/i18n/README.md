# @pyreon/i18n

Reactive internationalization — interpolation, CLDR pluralization, async namespace loading, rich JSX text.

`@pyreon/i18n` ships a `createI18n({ locale, messages, loader, fallbackLocale, pluralRules, onMissingKey })` factory that returns a signal-aware `I18nInstance` — `t(key, values)` reads the `locale` signal reactively so calls inside effects / computeds re-evaluate on locale change. Namespace lazy loading with promise deduplication, `addMessages` for runtime additions, and a `<Trans>` component for JSX-aware interpolation where simple string interpolation would lose markup. Two entry points: full (`@pyreon/i18n`, includes `<Trans>` + provider + hook) and framework-agnostic (`@pyreon/i18n/core` — only `createI18n` / `interpolate` / `resolvePluralCategory`, no `@pyreon/core` dep, safe for backend / edge workers / non-JSX consumers).

## Install

```bash
bun add @pyreon/i18n @pyreon/core @pyreon/reactivity
```

## Two entry points

| Entry              | Use when                                             | Includes                                                                |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `@pyreon/i18n`     | Pyreon UI app — you want the JSX components          | `createI18n`, `Trans`, `I18nProvider`, `useI18n`, `parseRichText`, types |
| `@pyreon/i18n/core` | Backend / edge / non-JSX runtime                     | `createI18n`, `interpolate`, `resolvePluralCategory`, types only         |

The `/core` entry transitively depends ONLY on `@pyreon/reactivity` — zero JSX, zero `@pyreon/core`. Use it for backend translation pipelines, edge workers, non-Pyreon frontends, or any context where you don't need the `<Trans>` JSX component. Both entries return identical `I18nInstance` objects, so switching later is non-breaking.

```ts
import { createI18n } from '@pyreon/i18n/core'

const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
i18n.t('hello') // 'Hi'
```

## Quick start

```ts
import { createI18n } from '@pyreon/i18n'

const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: {
      greeting: 'Hello, {{name}}!',
      items_one: '{{count}} item',
      items_other: '{{count}} items',
    },
    de: {
      greeting: 'Hallo, {{name}}!',
    },
  },
})

i18n.t('greeting', { name: 'Alice' }) // 'Hello, Alice!'
i18n.t('items', { count: 3 }) // '3 items'

i18n.locale.set('de')
i18n.t('greeting', { name: 'Alice' }) // 'Hallo, Alice!'
i18n.t('items', { count: 1 }) // '1 item' (fallback to en)
```

## `createI18n(options)`

| Option              | Type                                                      | Description                                              |
| ------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `locale`            | `string`                                                  | Initial locale (e.g. `'en'`)                             |
| `fallbackLocale`    | `string`                                                  | Locale to try when key is missing in active locale        |
| `messages`          | `Record<string, TranslationDictionary>`                   | Static messages, keyed by locale                          |
| `loader`            | `(locale, namespace) => Promise<TranslationDictionary?>`  | Async namespace loader                                    |
| `defaultNamespace`  | `string`                                                  | Default namespace for `t()` (default: `'common'`)        |
| `pluralRules`       | `Record<string, (count: number) => string>`               | Custom plural rules; defaults to `Intl.PluralRules`      |
| `onMissingKey`      | `(locale, key, namespace?) => string \| undefined`        | Missing-key handler — log, report, or supply a fallback   |

Returns `I18nInstance`:

| Property                              | Type                                              | Description                          |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| `t(key, values?)`                     | `(string, InterpolationValues?) => string`        | Translate; reads locale reactively   |
| `locale`                              | `Signal<string>`                                  | Current locale, writable             |
| `loadNamespace(ns, locale?)`          | `(string, string?) => Promise<void>`              | Load a namespace; deduped per-request |
| `isLoading`                           | `Computed<boolean>`                               | True while any namespace is loading  |
| `loadedNamespaces`                    | `Computed<Set<string>>`                           | Namespaces loaded for current locale |
| `exists(key)`                         | `(string) => boolean`                             | Check key existence                  |
| `addMessages(locale, messages, ns?)`  | `Function`                                        | Add messages at runtime (deep-merge) |
| `availableLocales`                    | `Computed<string[]>`                              | Locales with any registered messages |

## Namespaces + lazy loading

Split translations by feature and load on route entry. Concurrent loads for the same locale:namespace dedupe — calling `loadNamespace('auth')` twice returns the same promise.

```ts
const i18n = createI18n({
  locale: 'en',
  loader: async (locale, namespace) => {
    const mod = await import(`./locales/${locale}/${namespace}.json`)
    return mod.default
  },
})

await i18n.loadNamespace('auth')
i18n.t('auth:errors.invalid') // 'namespace:key.path' syntax
```

## Pluralization

Use CLDR-style `_zero` / `_one` / `_two` / `_few` / `_many` / `_other` suffixes with a `count` value. Resolution is via `Intl.PluralRules` by default; override per-locale with `pluralRules`.

```ts
// messages: { items_one: '{{count}} item', items_other: '{{count}} items' }
i18n.t('items', { count: 1 }) // '1 item'
i18n.t('items', { count: 5 }) // '5 items'
```

## Interpolation

```ts
import { interpolate } from '@pyreon/i18n'
interpolate('Hello, {{ name }}!', { name: 'World' }) // 'Hello, World!'
```

Supports whitespace inside braces. Unmatched placeholders are left as-is.

## `I18nProvider` / `useI18n()`

```tsx
import { createI18n, I18nProvider, useI18n } from '@pyreon/i18n'

const i18n = createI18n({ locale: 'en', messages: { en: { greeting: 'Hello {{name}}' } } })

;<I18nProvider instance={i18n}>
  <App />
</I18nProvider>

function Greeting() {
  const { t, locale } = useI18n()
  return () => <h1>{t('greeting', { name: 'World' })}</h1>
}
```

`I18nProvider` is marked `nativeCompat` so it works correctly under `@pyreon/{react,preact,vue,solid}-compat` apps. `useI18n` throws `[@pyreon/i18n] useI18n() must be used within an <I18nProvider>.` at dev time if no provider is mounted above.

`I18nContext` is also exported for advanced usage with `useContext` directly.

## `<Trans>` — rich JSX interpolation

When a translated string sits next to JSX elements (`<a>`, `<strong>`, etc.), plain `{t('cta')}` can't carry the markup. `<Trans>` resolves `{{values}}` first, then maps `<tag>content</tag>` patterns to component functions.

```tsx
// Translation: 'Read our <terms>terms</terms> and <privacy>policy</privacy>'
<Trans
  t={t}
  i18nKey="legal"
  components={{
    terms: (children) => <a href="/terms">{children}</a>,
    privacy: (children) => <a href="/privacy">{children}</a>,
  }}
/>
```

Caught by the opt-in lint rule `pyreon/i18n-prefer-trans-for-rich-jsx` when interleaving `{t('…')}` with element siblings.

## `parseRichText(text)`

Internal utility used by `<Trans>` — parses a string into `(string | { tag, children })[]`. Useful for custom rich-text renderers.

```ts
parseRichText('Hello <bold>world</bold>!')
// ['Hello ', { tag: 'bold', children: 'world' }, '!']
```

## Runtime message addition

Deep-merge new messages without async loading (e.g. server-rendered translation strings):

```ts
i18n.addMessages('en', { newFeature: 'Try our new feature!' })
i18n.addMessages('en', { errors: { timeout: 'Request timed out' } }, 'api')
```

## Devtools

```ts
import { i18nRegistry } from '@pyreon/i18n/devtools'
// WeakRef registry of live i18n instances — tree-shakeable.
```

## Types

| Type                    | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `I18nInstance`          | Public API returned by `createI18n()`                                                |
| `I18nOptions`           | Options for `createI18n()`                                                           |
| `TranslationDictionary` | `{ [key: string]: string \| TranslationDictionary }`                                 |
| `TranslationMessages`   | `Record<string, TranslationDictionary>`                                              |
| `NamespaceLoader`       | `(locale: string, namespace: string) => Promise<TranslationDictionary \| undefined>` |
| `InterpolationValues`   | `Record<string, string \| number>`                                                   |
| `PluralRules`           | `Record<string, (count: number) => string>`                                          |
| `I18nProviderProps`     | Props for `I18nProvider`: `{ instance: I18nInstance; children?: VNodeChild }`        |
| `TransProps`            | Props for `Trans` component                                                          |

## Typed translation keys (opt-in)

`MessageKeys<M>` derives the dot-path key union of a messages object (plural suffixes `_one`/`_other`/… collapse to the base key; recursion depth-capped at 6 levels), and `createI18n<typeof en>()` plugs it into the instance so typos become compile errors — purely additive, untyped usage is unchanged:

```ts
const en = {
  greeting: 'Hello {{name}}',
  nav: { home: 'Home', about: 'About' },
  items_one: '{{count}} item',
  items_other: '{{count}} items',
} as const

const i18n = createI18n<typeof en>({ locale: 'en', messages: { en } })
i18n.t('nav.home')            // ✓ autocompleted + checked
i18n.t('items', { count: 2 }) // ✓ plural suffixes collapse to the base key
i18n.t('auth:errors.invalid') // ✓ namespaced keys stay unchecked (runtime-loaded)
// i18n.t('nav.hoem')         // ✗ compile error

// Per-message param extraction (needs `as const` — literal values carry the {{param}} names):
import type { MessageKeys, TranslationParams } from '@pyreon/i18n'
type Keys = MessageKeys<typeof en> // 'greeting' | 'nav.home' | 'nav.about' | 'items'
type P = TranslationParams<typeof en, 'greeting'> // { name: InterpolationValue }
```

Over a messages object typed as `TranslationDictionary` (index signature) the helpers degrade gracefully to `string` / `InterpolationValues`. `useI18n()` returns the untyped view (context erases the key type) — keep a module-level typed instance for typed `t`.

## Gotchas

- **`t()` reads `locale` reactively** — call it inside effects / computeds / JSX accessors so re-evaluation happens on locale change. Reading once at setup captures the initial value.
- **Concurrent `loadNamespace` calls dedupe** — calling `loadNamespace('auth')` twice in parallel returns the same in-flight promise.
- **Missing keys return the key string itself** as a visual fallback (`'auth:missing.key'`). Override via `onMissingKey`.
- **Default namespace is `'common'`** — keys without a `namespace:` prefix look up in `common`.
- **`addMessages` deep-merges** — it does not replace the entire namespace.
- **`/core` entry only depends on `@pyreon/reactivity`** — picking the right entry per consumer keeps backend bundles JSX-free.

## Documentation

Full docs: [pyreon.dev/docs/i18n](https://pyreon.dev/docs/i18n) (or `docs/src/content/docs/i18n.md` in this repo).

## License

MIT
