import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — i18n snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/i18n — Reactive i18n with async namespace loading, plurals, interpolation. \`@pyreon/i18n\` includes JSX components (Trans, I18nProvider, useI18n) and depends on \`@pyreon/core\`. \`@pyreon/i18n/core\` is framework-agnostic with only \`@pyreon/reactivity\` as a dependency — use it for backends and edge workers."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/i18n — Internationalization

      Signal-based internationalization for Pyreon. \`createI18n\` returns a reactive \`t(key, values?)\` function with \`{{name}}\` interpolation and \`_one\`/\`_other\` plural suffixes. Namespace lazy loading deduplicates concurrent requests. Two entry points: \`@pyreon/i18n\` (full — includes JSX \`Trans\` component, \`I18nProvider\`, \`useI18n\`) and \`@pyreon/i18n/core\` (framework-agnostic — only \`createI18n\`, \`interpolate\`, \`resolvePluralCategory\`, types). The \`/core\` entry transitively depends only on \`@pyreon/reactivity\` with zero JSX, making it suitable for backend translation pipelines, edge workers, and non-Pyreon frontends.

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
      interpolate('Hello, {{name}}!', { name: 'Server' })  // 'Hello, Server!'
      \`\`\`

      > **Two entry points**: \`@pyreon/i18n\` includes JSX components (Trans, I18nProvider, useI18n) and depends on \`@pyreon/core\`. \`@pyreon/i18n/core\` is framework-agnostic with only \`@pyreon/reactivity\` as a dependency — use it for backends and edge workers.
      >
      > **Plural suffixes**: Pluralization uses \`_one\`/\`_other\` key suffixes (e.g. \`items_one\`, \`items_other\`). Pass \`count\` in the values object. Custom plural rules can be provided for non-English languages.
      >
      > **Namespace deduplication**: Concurrent calls to \`loadNamespace\` for the same locale+namespace share a single fetch — the second call awaits the first, not a duplicate request.
      >
      > **Devtools**: Import \`@pyreon/i18n/devtools\` for a WeakRef-based registry of live i18n instances. Tree-shakeable — zero cost unless imported.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(5)
    expect(record['i18n/createI18n']!.notes).toContain('reactive')
    expect(record['i18n/createI18n']!.mistakes?.split('\n').length).toBe(3)
  })
})
