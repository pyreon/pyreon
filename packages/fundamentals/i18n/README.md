# @pyreon/i18n

Reactive internationalization for Pyreon. Async namespace loading, pluralization, interpolation, and rich JSX text.

## Install

```bash
bun add @pyreon/i18n
```

## Quick Start

```ts
import { createI18n } from "@pyreon/i18n"

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
    en: {
      greeting: "Hello, {{name}}!",
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    },
    de: {
      greeting: "Hallo, {{name}}!",
    },
  },
})

i18n.t("greeting", { name: "Alice" }) // "Hello, Alice!"
i18n.t("items", { count: 3 })         // "3 items"

i18n.locale.set("de")
i18n.t("greeting", { name: "Alice" }) // "Hallo, Alice!"
i18n.t("items", { count: 1 })         // "1 item" (fallback to en)
```

## API

### `createI18n(options)`

Create a reactive i18n instance with static messages and/or an async namespace loader.

| Parameter | Type | Description |
| --- | --- | --- |
| `options.locale` | `string` | Initial locale (e.g. `"en"`) |
| `options.fallbackLocale` | `string` | Locale to try when key is missing in active locale |
| `options.messages` | `Record<string, TranslationDictionary>` | Static messages keyed by locale |
| `options.loader` | `NamespaceLoader` | `(locale, namespace) => Promise<TranslationDictionary>` |
| `options.defaultNamespace` | `string` | Default namespace for `t()` (default: `"common"`) |
| `options.pluralRules` | `PluralRules` | Custom plural rules per locale |
| `options.onMissingKey` | `(locale, key, namespace?) => string \| undefined` | Missing key handler |

**Returns:** `I18nInstance` with:

| Property | Type | Description |
| --- | --- | --- |
| `t(key, values?)` | `(key: string, values?: InterpolationValues) => string` | Translate a key |
| `locale` | `Signal<string>` | Current locale (reactive, writable) |
| `loadNamespace(ns, locale?)` | `(ns: string, locale?: string) => Promise<void>` | Load a namespace |
| `isLoading` | `Computed<boolean>` | Whether any namespace is loading |
| `loadedNamespaces` | `Computed<Set<string>>` | Namespaces loaded for current locale |
| `exists(key)` | `(key: string) => boolean` | Check if a key exists |
| `addMessages(locale, messages, ns?)` | `Function` | Add messages at runtime |
| `availableLocales` | `Computed<string[]>` | All locales with registered messages |

```ts
const i18n = createI18n({
  locale: "en",
  loader: async (locale, namespace) => {
    const mod = await import(`./locales/${locale}/${namespace}.json`)
    return mod.default
  },
})
await i18n.loadNamespace("auth")
i18n.t("auth:errors.invalid")  // namespace:key.path syntax
```

### `interpolate(template, values?)`

Replace `{{key}}` placeholders in a string. Supports whitespace inside braces. Unmatched placeholders are left as-is.

| Parameter | Type | Description |
| --- | --- | --- |
| `template` | `string` | Template string with `{{placeholders}}` |
| `values` | `InterpolationValues` | Key-value pairs for substitution |

**Returns:** `string`

```ts
interpolate("Hello, {{ name }}!", { name: "World" })
// "Hello, World!"
```

### `resolvePluralCategory(locale, count, customRules?)`

Resolve the CLDR plural category for a count. Uses custom rules if provided, then `Intl.PluralRules`, then a basic `one`/`other` fallback.

| Parameter | Type | Description |
| --- | --- | --- |
| `locale` | `string` | Locale code |
| `count` | `number` | The number to pluralize for |
| `customRules` | `PluralRules` | Optional custom rules per locale |

**Returns:** `string` — one of `"zero"`, `"one"`, `"two"`, `"few"`, `"many"`, `"other"`

```ts
resolvePluralCategory("en", 1)   // "one"
resolvePluralCategory("en", 5)   // "other"
resolvePluralCategory("ar", 3)   // "few" (via Intl.PluralRules)
```

### `I18nProvider` / `useI18n()`

Context pattern for providing an i18n instance to the component tree.

```tsx
// Root:
<I18nProvider instance={i18n}>
  <App />
</I18nProvider>

// Any descendant:
function Greeting() {
  const { t, locale } = useI18n()
  return () => <h1>{t("greeting", { name: "World" })}</h1>
}
```

`I18nContext` is also exported for advanced usage with `useContext` directly.

### `Trans`

Rich JSX interpolation component. Resolves `{{values}}` first, then maps `<tag>content</tag>` patterns to component functions.

| Parameter | Type | Description |
| --- | --- | --- |
| `t` | `(key, values?) => string` | Translation function (from `useI18n()`) |
| `i18nKey` | `string` | Translation key |
| `values` | `InterpolationValues` | Interpolation values |
| `components` | `Record<string, (children) => VNode>` | Component map for rich tags |

```tsx
// Translation: "Read our <terms>terms</terms> and <privacy>policy</privacy>"
<Trans
  t={t}
  i18nKey="legal"
  components={{
    terms: (children) => <a href="/terms">{children}</a>,
    privacy: (children) => <a href="/privacy">{children}</a>,
  }}
/>
```

### `parseRichText(text)`

Parse a string into an array of plain text and `{ tag, children }` segments. Used internally by `Trans`.

| Parameter | Type | Description |
| --- | --- | --- |
| `text` | `string` | String with `<tag>content</tag>` patterns |

**Returns:** `(string | { tag: string, children: string })[]`

```ts
parseRichText("Hello <bold>world</bold>!")
// ["Hello ", { tag: "bold", children: "world" }, "!"]
```

## Patterns

### Namespace-Based Loading

Split translations by feature and load them lazily.

```ts
const i18n = createI18n({
  locale: "en",
  loader: (locale, ns) => fetch(`/locales/${locale}/${ns}.json`).then(r => r.json()),
})

// Load on route entry:
await i18n.loadNamespace("dashboard")
i18n.t("dashboard:widgets.chart")
```

### Runtime Message Addition

Add messages without async loading (e.g. from server-rendered data).

```ts
i18n.addMessages("en", { newFeature: "Try our new feature!" })
i18n.addMessages("en", { errors: { timeout: "Request timed out" } }, "api")
```

### Pluralization

Use `_one`, `_other` (and `_zero`, `_two`, `_few`, `_many` for complex locales) suffixes with a `count` value.

```ts
// messages: { items_one: "{{count}} item", items_other: "{{count}} items" }
i18n.t("items", { count: 1 })  // "1 item"
i18n.t("items", { count: 5 })  // "5 items"
```

## Types

| Type | Description |
| --- | --- |
| `I18nInstance` | Public API returned by `createI18n()` |
| `I18nOptions` | Options for `createI18n()` |
| `TranslationDictionary` | `{ [key: string]: string \| TranslationDictionary }` |
| `TranslationMessages` | `Record<string, TranslationDictionary>` |
| `NamespaceLoader` | `(locale: string, namespace: string) => Promise<TranslationDictionary \| undefined>` |
| `InterpolationValues` | `Record<string, string \| number>` |
| `PluralRules` | `Record<string, (count: number) => string>` |
| `I18nProviderProps` | Props for `I18nProvider`: `{ instance: I18nInstance }` |
| `TransProps` | Props for `Trans` component |

## Gotchas

- `t()` reads `locale` reactively — it re-evaluates inside effects and computeds when the locale changes.
- Concurrent loads for the same locale:namespace are deduplicated — calling `loadNamespace("auth")` twice returns the same promise.
- Missing keys return the key string itself as a visual fallback (e.g. `"auth:missing.key"`).
- The default namespace is `"common"` — keys without a `namespace:` prefix look up in the `"common"` namespace.
- `addMessages` deep-merges into existing translations. It does not replace the entire namespace.
