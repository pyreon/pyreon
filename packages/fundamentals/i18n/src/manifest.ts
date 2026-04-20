import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/i18n',
  title: 'Internationalization',
  tagline:
    'Reactive i18n with async namespace loading, plurals, interpolation',
  description:
    'Signal-based internationalization for Pyreon. `createI18n` returns a reactive `t(key, values?)` function with `{{name}}` interpolation and `_one`/`_other` plural suffixes. Namespace lazy loading deduplicates concurrent requests. Two entry points: `@pyreon/i18n` (full — includes JSX `Trans` component, `I18nProvider`, `useI18n`) and `@pyreon/i18n/core` (framework-agnostic — only `createI18n`, `interpolate`, `resolvePluralCategory`, types). The `/core` entry transitively depends only on `@pyreon/reactivity` with zero JSX, making it suitable for backend translation pipelines, edge workers, and non-Pyreon frontends.',
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
      {() => t('greeting', { name: 'User' })}
      <Trans key="rich" components={{ bold: <strong /> }}>
        This has <bold>rich text</bold> inside.
      </Trans>
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
    '{{name}} interpolation and _one/_other plural suffixes',
    'Async namespace loading with request deduplication',
    'I18nProvider / useI18n context pattern',
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
        'Create a reactive i18n instance. Returns `{ t, locale, addMessages, loadNamespace }`. The `t(key, values?)` function resolves translations reactively — changing `locale` via `.set()` re-evaluates all `t()` reads in reactive scopes. Supports `{{name}}` interpolation, `_one`/`_other` plural suffixes, namespace lazy loading with deduplication, fallback locale, and custom plural rules. Available from both `@pyreon/i18n` and `@pyreon/i18n/core`.',
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
      seeAlso: ['I18nProvider', 'useI18n', 'Trans', 'interpolate'],
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
return <div>{() => t('greeting', { name: 'User' })}</div>`,
      seeAlso: ['I18nProvider', 'createI18n'],
    },
    {
      name: 'Trans',
      kind: 'component',
      signature: '(props: TransProps) => VNodeChild',
      summary:
        'Rich text interpolation component. Translates a key and replaces named placeholders with JSX components. Use for translations that contain markup (bold, links, etc.) that cannot be expressed as plain string interpolation.',
      example: `// Message: "Please <link>click here</link> to continue"
<Trans key="action" components={{ link: <a href="/next" /> }}>
  Please <link>click here</link> to continue
</Trans>`,
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
      label: 'Plural suffixes',
      note: 'Pluralization uses `_one`/`_other` key suffixes (e.g. `items_one`, `items_other`). Pass `count` in the values object. Custom plural rules can be provided for non-English languages.',
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
