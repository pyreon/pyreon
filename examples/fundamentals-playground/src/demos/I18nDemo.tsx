import type { VNodeChild } from '@pyreon/core'
import { createI18n, I18nProvider, Trans, useI18n } from '@pyreon/i18n'
import { signal } from '@pyreon/reactivity'

const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: {
      greeting: 'Hello, {{name}}!',
      description: 'You have been here for {{count}} seconds.',
      items_one: '{{count}} item in cart',
      items_other: '{{count}} items in cart',
      rich: 'Welcome to <bold>Pyreon</bold> i18n!',
      nav: { home: 'Home', about: 'About', settings: 'Settings' },
    },
    de: {
      greeting: 'Hallo, {{name}}!',
      description: 'Du bist seit {{count}} Sekunden hier.',
      items_one: '{{count}} Artikel im Warenkorb',
      items_other: '{{count}} Artikel im Warenkorb',
      rich: 'Willkommen bei <bold>Pyreon</bold> i18n!',
      nav: { home: 'Startseite', about: 'Uber uns', settings: 'Einstellungen' },
    },
    ja: {
      greeting: '{{name}}さん、こんにちは！',
      description: '{{count}}秒間ここにいます。',
      items_other: 'カートに{{count}}個の商品',
      rich: '<bold>Pyreon</bold> i18nへようこそ！',
      nav: { home: 'ホーム', about: '概要', settings: '設定' },
    },
  },
})

function I18nContent() {
  const { t, locale } = useI18n()
  const name = signal('Alice')
  const count = signal(1)
  const seconds = signal(0)

  setInterval(() => seconds.update((s) => s + 1), 1000)

  return (
    <div>
      <div class="section">
        <h3>Locale Switcher</h3>
        <div class="row">
          {['en', 'de', 'ja'].map((loc) => (
            <button
              key={loc}
              class={locale() === loc ? 'primary' : ''}
              onClick={() => locale.set(loc)}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>
        <p style="margin-top: 8px; color: #666">
          Current: <strong>{() => locale()}</strong> | Available:{' '}
          {() => i18n.availableLocales().join(', ')}
        </p>
      </div>

      <div class="section">
        <h3>Interpolation</h3>
        <div class="field">
          <label>Name</label>
          <input
            value={name()}
            onInput={(e: Event) => name.set((e.target as HTMLInputElement).value)}
          />
        </div>
        <p style="font-size: 18px">{() => t('greeting', { name: name() })}</p>
        <p style="color: #666">{() => t('description', { count: seconds() })}</p>
      </div>

      <div class="section">
        <h3>Pluralization</h3>
        <div class="row" style="margin-bottom: 8px">
          <button onClick={() => count.update((c) => Math.max(0, c - 1))}>-</button>
          <span style="min-width: 30px; text-align: center">{() => count()}</span>
          <button onClick={() => count.update((c) => c + 1)}>+</button>
        </div>
        <p>{() => t('items', { count: count() })}</p>
      </div>

      <div class="section">
        <h3>Rich Text (Trans)</h3>
        <Trans
          t={t}
          i18nKey="rich"
          components={{
            bold: (children: VNodeChild) => <strong style="color: #6c63ff">{children}</strong>,
          }}
        />
      </div>

      <div class="section">
        <h3>Nested Keys</h3>
        <div class="row">
          <span class="badge blue">{() => t('nav.home')}</span>
          <span class="badge blue">{() => t('nav.about')}</span>
          <span class="badge blue">{() => t('nav.settings')}</span>
        </div>
      </div>
    </div>
  )
}

export function I18nDemo() {
  return (
    <div>
      <h2>i18n</h2>
      <p class="desc">
        Reactive internationalization with interpolation, pluralization, and rich text.
      </p>
      <I18nProvider instance={i18n}>
        <I18nContent />
      </I18nProvider>
    </div>
  )
}
