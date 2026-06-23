import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { I18nProvider } from '../context'
import { createI18n } from '../create-i18n'
import { Trans } from '../trans'

/**
 * <Trans> auto-reads `t` from the nearest <I18nProvider> via useI18n() when no
 * `t` prop is passed. These mount through a real provider tree and assert on
 * rendered DOM (what users see).
 */
describe('Trans — reads t from context (no t prop)', () => {
  function newContainer(): HTMLElement {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
  }

  it('renders a plain translation from the provider instance, no t prop', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { greeting: 'Hello {{name}}' } },
    })
    const container = newContainer()
    mount(
      h(I18nProvider, { value: i18n }, h(Trans, { i18nKey: 'greeting', values: { name: 'Bo' } })),
      container,
    )
    expect(container.textContent).toBe('Hello Bo')
    container.remove()
  })

  it('renders rich components from context (no t prop)', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { legal: 'Read the <terms>terms</terms> now' } },
    })
    const container = newContainer()
    mount(
      h(
        I18nProvider,
        { value: i18n },
        h(Trans, {
          i18nKey: 'legal',
          components: { terms: (children: string) => h('a', { href: '/terms' }, children) },
        }),
      ),
      container,
    )
    expect(container.innerHTML).toContain('<a href="/terms">terms</a>')
    expect(container.textContent).toBe('Read the terms now')
    container.remove()
  })

  it('an explicit t prop overrides the context instance', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { k: 'FromContext' } } })
    const container = newContainer()
    mount(
      h(
        I18nProvider,
        { value: i18n },
        h(Trans, { i18nKey: 'k', t: () => 'FromProp' }),
      ),
      container,
    )
    expect(container.textContent).toBe('FromProp')
    container.remove()
  })

  it('throws a clear error when no t prop AND no provider', () => {
    expect(() => Trans({ i18nKey: 'k' })).toThrow(/useI18n\(\) must be used within an <I18nProvider>/)
  })
})
