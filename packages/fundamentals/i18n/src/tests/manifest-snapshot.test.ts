import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — i18n snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/i18n — Reactive i18n with Intl number/date/relative-time formatting, plurals, interpolation, async namespaces. \`@pyreon/i18n\` includes JSX components (Trans, I18nProvider, useI18n) and depends on \`@pyreon/core\`. \`@pyreon/i18n/core\` is framework-agnostic with only \`@pyreon/reactivity\` as a dependency — use it for backends and edge workers."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/i18n — Internationalization

      Signal-based internationalization for Pyreon. \`createI18n\` returns a reactive \`t(key, values?)\` plus locale-reactive \`Intl\` formatters \`n()\` (number/currency/percent), \`d()\` (date/time) and \`rt()\` (relative time) — formatters are memoized per (locale, options). Translations support \`{{name}}\` interpolation, inline format specifiers (\`{{amount, currency}}\`, \`{{when, date}}\`, \`{{n, relativetime, day}}\`), \`_one\`/\`_other\`/\`_zero\` plural suffixes, \`context\` (gender/variant), \`defaultValue\`, and \`$t(key)\` nesting. Namespace lazy loading deduplicates concurrent requests. Two entry points: \`@pyreon/i18n\` (full — includes JSX \`Trans\` component, \`I18nProvider\`, \`useI18n\`) and \`@pyreon/i18n/core\` (framework-agnostic — only \`createI18n\`, \`interpolate\`, \`resolvePluralCategory\`, types). The \`/core\` entry transitively depends only on \`@pyreon/reactivity\` with zero JSX, making it suitable for backend translation pipelines, edge workers, and non-Pyreon frontends.

      \`\`\`typescript
      import { createI18n, I18nProvider, useI18n, Trans } from '@pyreon/i18n'

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
      interpolate('Hello, {{name}}!', { name: 'Server' })  // 'Hello, Server!'
      \`\`\`

      > **Two entry points**: \`@pyreon/i18n\` includes JSX components (Trans, I18nProvider, useI18n) and depends on \`@pyreon/core\`. \`@pyreon/i18n/core\` is framework-agnostic with only \`@pyreon/reactivity\` as a dependency — use it for backends and edge workers.
      >
      > **Plural suffixes + _zero + context**: Pluralization uses \`_one\`/\`_other\` key suffixes (e.g. \`items_one\`, \`items_other\`) selected by \`count\`. \`count === 0\` tries an explicit \`_zero\` form first (so English can say "No items"). \`context\` (gender/variant) combines with plurals: \`t(key, { context: "male", count: 1 })\` tries \`key_male_one\` → \`key_male\` → \`key_one\` → \`key\`. Custom plural rules can be provided for non-English languages.
      >
      > **Formatters are reactive + memoized**: \`n()\`/\`d()\`/\`rt()\` read the locale signal, so read them inside reactive scopes (JSX/effect) to re-format on locale change. The underlying \`Intl.*Format\` instances are memoized per (locale, options) — repeated calls in a rendered list are cheap. Configure reusable named formats via \`numberFormats\`/\`dateFormats\`/\`relativeTimeFormats\` and reference them by name (\`n(9.99, "currency")\`) or inline (\`"{{amount, currency}}"\`).
      >
      > **Reserved value keys**: \`count\`, \`context\`, and \`defaultValue\` in the \`t()\` values object are interpreted as options (not interpolated as \`{{context}}\` unless the translation literally references them). \`defaultValue\` is returned (interpolated) when the key is missing, before the key-as-fallback.
      >
      > **Namespace deduplication**: Concurrent calls to \`loadNamespace\` for the same locale+namespace share a single fetch — the second call awaits the first, not a duplicate request.
      >
      > **Devtools**: Import \`@pyreon/i18n/devtools\` for a WeakRef-based registry of live i18n instances. Tree-shakeable — zero cost unless imported.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(8)
    expect(record['i18n/createI18n']!.notes).toContain('reactive')
    expect(record['i18n/createI18n']!.mistakes?.split('\n').length).toBe(3)
    // Formatter methods are documented for MCP get_api.
    expect(record['i18n/n']!.signature).toContain('Intl.NumberFormatOptions')
    expect(record['i18n/d']!.signature).toContain('Intl.DateTimeFormatOptions')
    expect(record['i18n/rt']!.signature).toContain('Intl.RelativeTimeFormatUnit')
  })
})
