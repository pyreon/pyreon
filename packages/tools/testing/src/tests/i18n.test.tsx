/**
 * `@pyreon/testing/i18n` — happy-dom suite.
 */
import { createI18n, useI18n } from '@pyreon/i18n'
import { describe, expect, it } from 'vitest'
import { renderWithI18n } from '../i18n'

const messages = {
  en: { home: 'Home', greet: 'Hello {{name}}' },
  cs: { home: 'Domů', greet: 'Ahoj {{name}}' },
}

function Nav() {
  const { t } = useI18n()
  return <nav>{() => t('home')}</nav>
}

describe('renderWithI18n', () => {
  it('provides a created instance; t() is bound', () => {
    const { getByText, t, i18n } = renderWithI18n(<Nav />, { locale: 'en', messages })
    expect(getByText('Home')).toBeTruthy()
    expect(t('greet', { name: 'Ada' })).toBe('Hello Ada')
    expect(i18n.locale()).toBe('en')
  })

  it('setLocale flips rendered translations reactively (in place)', () => {
    const { container, setLocale, t } = renderWithI18n(<Nav />, { locale: 'en', messages })
    const nav = container.querySelector('nav')!
    expect(nav.textContent).toBe('Home')
    setLocale('cs')
    expect(container.querySelector('nav')).toBe(nav) // no remount
    expect(nav.textContent).toBe('Domů')
    expect(t('home')).toBe('Domů')
  })

  it('accepts a pre-built instance', () => {
    const i18n = createI18n({ locale: 'cs', messages })
    const { getByText, i18n: returned } = renderWithI18n(<Nav />, { i18n })
    expect(returned).toBe(i18n)
    expect(getByText('Domů')).toBeTruthy()
  })

  it('composes an outer wrapper', () => {
    const { container } = renderWithI18n(<Nav />, {
      locale: 'en',
      messages,
      wrapper: (children) => <section data-outer="1">{children}</section>,
    })
    expect(container.querySelector('[data-outer="1"] nav')!.textContent).toBe('Home')
  })

  it('forwards render options (container) without exactOptionalPropertyTypes violations', () => {
    const host = document.body.appendChild(document.createElement('main'))
    const { container } = renderWithI18n(<Nav />, { locale: 'en', messages, container: host })
    expect(container).toBe(host)
    host.remove()
  })

  it('throws an actionable error when neither locale nor i18n is given', () => {
    expect(() => renderWithI18n(<Nav />, {} as never)).toThrow(
      /pass `locale` \+ `messages` \(or a pre-built `i18n` instance\)/,
    )
  })
})
