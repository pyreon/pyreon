// @vitest-environment happy-dom
import { h } from '@pyreon/core'
import { createRouter, setActiveRouter } from '@pyreon/router'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _registerI18nConfig,
  detectLocaleFromHeader,
  extractLocaleFromPath,
  localeSignal,
  setLocale,
  useLocale,
  type I18nRoutingConfig,
} from '../i18n-routing'

const Page = () => h('div', null, 'page')
const routes = [
  { path: '/', component: Page },
  { path: '/about', component: Page },
  { path: '/de', component: Page },
  { path: '/de/about', component: Page },
  { path: '/en-US/about', component: Page },
]

afterEach(() => {
  _registerI18nConfig(undefined)
  setActiveRouter(null)
  localeSignal.set('en')
  window.history.replaceState(null, '', '/')
})

describe('region locales round-trip', () => {
  const locales = ['en', 'en-US', 'pt-BR']

  it('a lowercased URL segment resolves to the configured spelling', () => {
    expect(extractLocaleFromPath('/en-us/about', locales, 'en')).toEqual({
      locale: 'en-US',
      pathWithoutLocale: '/about',
    })
    expect(extractLocaleFromPath('/PT-br', locales, 'en').locale).toBe('pt-BR')
  })

  it('Accept-Language matches a full region tag before the base language', () => {
    expect(detectLocaleFromHeader('pt-BR,en;q=0.5', locales, 'en')).toBe('pt-BR')
    expect(detectLocaleFromHeader('en-us', locales, 'en')).toBe('en-US')
    // base-language fallbacks in both directions
    expect(detectLocaleFromHeader('pt-PT', locales, 'en')).toBe('pt-BR')
    expect(detectLocaleFromHeader('de-AT', ['de', 'en'], 'en')).toBe('de')
  })
})

describe('useLocale without the dev middleware (production SSR / SSG / client)', () => {
  const config: I18nRoutingConfig = { locales: ['en', 'de'], defaultLocale: 'en' }

  it('derives the locale from the current route once the config is registered', async () => {
    _registerI18nConfig(config)
    const router = createRouter({ routes, mode: 'history', url: '/de/about' })
    setActiveRouter(router as never)
    expect(useLocale()).toBe('de')
  })

  it('falls back to location.pathname (minus base) when no router is active', () => {
    _registerI18nConfig(config)
    window.history.replaceState(null, '', '/de/about')
    expect(useLocale()).toBe('de')
    window.history.replaceState(null, '', '/about')
    expect(useLocale()).toBe('en')
  })
})

describe('setLocale preserves query and hash', () => {
  const config: I18nRoutingConfig = { locales: ['en', 'de'], defaultLocale: 'en' }

  it('without a router', () => {
    window.history.replaceState(null, '', '/about?tab=2#top')
    setLocale('de', config)
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/de/about?tab=2#top',
    )
  })

  it('through the active router', async () => {
    window.history.replaceState(null, '', '/about?tab=2#top')
    const router = createRouter({ routes, mode: 'history', url: '/about?tab=2#top' })
    setActiveRouter(router as never)
    const pushed: string[] = []
    const original = router.push.bind(router)
    router.push = ((to: string) => {
      pushed.push(to)
      return original(to)
    }) as typeof router.push
    setLocale('de', config)
    expect(pushed).toEqual(['/de/about?tab=2#top'])
  })
})
