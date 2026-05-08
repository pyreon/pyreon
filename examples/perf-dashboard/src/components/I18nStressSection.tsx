/**
 * I18nStressSection — exercises `@pyreon/i18n`'s hot path so the perf
 * harness can record counter signatures across the four canonical
 * journeys (render, interpolate, localeFlip, plural).
 *
 * Window helper `__pyreon_perf_i18n` is the journey driver — it lets
 * `examples/perf-dashboard/src/journeys.ts` deterministically seed scale
 * and run loops without going through the DOM. Loop journeys (interpolate,
 * plural) call `t()` directly in a tight loop; render journeys
 * (rendered, localeFlip) drive a `renderScale` signal that fans out into
 * a `<For>` over N nodes, each reading `t()` reactively.
 *
 * Stress shape:
 *  - 2 locales × 1 namespace × ~50 keys → enough variety to make the
 *    dot-path lookup non-trivial without bloating the bundle.
 *  - `greeting` is the canonical interpolation template.
 *  - `items_one` / `items_other` are the canonical plural forms.
 */
import { For } from '@pyreon/core'
import { createI18n } from '@pyreon/i18n'
import type { TranslationDictionary } from '@pyreon/i18n'
import { signal } from '@pyreon/reactivity'
import { themeSignal } from '../App'
import { Card, CardLabel, CardValue, GhostButton, Grid, Row, Section, SectionTitle } from './atoms'

// ── Sample translation set ──────────────────────────────────────────────
//
// 50 unique keys each in `en` and `cs`. Most are leaf strings; a few are
// nested under `nav.*` and `auth.*` to exercise the dot-path traversal.
// The `_one` / `_other` plural variants for `items` cover the plural path.
function buildMessages(locale: string): TranslationDictionary {
  const result: TranslationDictionary = {
    greeting: locale === 'en' ? 'Hello {{name}}!' : 'Ahoj {{name}}!',
    farewell: locale === 'en' ? 'Goodbye' : 'Sbohem',
    welcome: locale === 'en' ? 'Welcome' : 'Vítejte',
    loading: locale === 'en' ? 'Loading…' : 'Načítání…',
    error: locale === 'en' ? 'Error' : 'Chyba',
    items_one: locale === 'en' ? '{{count}} item' : '{{count}} položka',
    items_other: locale === 'en' ? '{{count}} items' : '{{count}} položek',
  }
  // 30 numbered leaves — leaf is a plain string (no `{{}}`), exercises the
  // hot lookup-then-no-interpolation path.
  for (let i = 0; i < 30; i++) result[`leaf${i}`] = `${locale}-leaf-${i}`
  // 10 nested keys under nav.*
  const nav: Record<string, string> = {}
  for (let i = 0; i < 10; i++) nav[`item${i}`] = `${locale}-nav-${i}`
  result.nav = nav
  // 5 nested keys under auth.errors.*
  result.auth = {
    errors: {
      invalid: locale === 'en' ? 'Invalid credentials' : 'Neplatné přihlášení',
      expired: locale === 'en' ? 'Session expired' : 'Relace vypršela',
      forbidden: locale === 'en' ? 'Forbidden' : 'Zakázáno',
      throttled: locale === 'en' ? 'Too many requests' : 'Příliš mnoho požadavků',
      unknown: locale === 'en' ? 'Unknown error' : 'Neznámá chyba',
    },
  }
  return result
}

const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  defaultNamespace: 'common',
  messages: {
    en: buildMessages('en'),
    cs: buildMessages('cs'),
  },
})

// ── Stress state ────────────────────────────────────────────────────────

/** Drives the rendered fan-out (i18nT-1000 + i18nT-localeFlip-100). */
const renderScale = signal(0)

interface RenderItem {
  id: number
}

function buildRenderItems(n: number): RenderItem[] {
  return Array.from({ length: n }, (_, i) => ({ id: i }))
}

const renderItems = signal<RenderItem[]>([])

// ── Window helper for journey drivers ───────────────────────────────────

interface PerfI18nHelper {
  /** Reset all stress state so journeys start from a known shape. */
  reset(): void
  /** Mount N rendered items, each calling t('greeting') reactively. */
  setRenderScale(n: number): void
  /** Tight loop: call t('greeting', { name }) `n` times — no DOM impact. */
  runInterpolate(n: number): void
  /** Tight loop: call t('items', { count }) `n` times — exercises plural. */
  runPlural(n: number): void
  /** Toggle locale; rendered subscribers re-run reactively. */
  flipLocale(): void
}

declare global {
  interface Window {
    __pyreon_perf_i18n?: PerfI18nHelper
  }
}

const helper: PerfI18nHelper = {
  reset() {
    renderItems.set([])
    renderScale.set(0)
    i18n.locale.set('en')
  },
  setRenderScale(n: number) {
    renderScale.set(n)
    renderItems.set(buildRenderItems(n))
  },
  runInterpolate(n: number) {
    // The result is intentionally discarded; the COUNTER is the measurement.
    for (let i = 0; i < n; i++) i18n.t('greeting', { name: `User${i}` })
  },
  runPlural(n: number) {
    for (let i = 0; i < n; i++) i18n.t('items', { count: i % 5 })
  },
  flipLocale() {
    i18n.locale.set(i18n.locale() === 'en' ? 'cs' : 'en')
  },
}

if (typeof window !== 'undefined') {
  window.__pyreon_perf_i18n = helper
}

// ── Component ───────────────────────────────────────────────────────────

export function I18nStressSection() {
  return (
    <Section theme={themeSignal()}>
      <Row>
        <SectionTitle theme={themeSignal()}>i18n stress (t / interpolate / plural / localeFlip)</SectionTitle>
        <div style="flex: 1" />
        <GhostButton
          theme={themeSignal()}
          data-testid="i18n-render-1000"
          onClick={() => helper.setRenderScale(1000)}
        >
          Render 1000
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="i18n-render-100"
          onClick={() => helper.setRenderScale(100)}
        >
          Render 100
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="i18n-flip-locale"
          onClick={() => helper.flipLocale()}
        >
          Flip locale
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="i18n-reset"
          onClick={() => helper.reset()}
        >
          Reset
        </GhostButton>
      </Row>
      <div data-testid="i18n-stress-ready" style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 200px; overflow-y: auto;">
        <For each={() => renderItems()} by={(item: RenderItem) => item.id}>
          {(item: RenderItem) => (
            <span
              data-testid={`i18n-item-${item.id}`}
              style="font-family: monospace; font-size: 11px; padding: 2px 6px;"
            >
              {() => i18n.t('greeting', { name: `User${item.id}` })}
            </span>
          )}
        </For>
      </div>
      <Grid>
        <Card theme={themeSignal()}>
          <CardLabel theme={themeSignal()}>Locale</CardLabel>
          <CardValue theme={themeSignal()}>{() => i18n.locale()}</CardValue>
        </Card>
        <Card theme={themeSignal()}>
          <CardLabel theme={themeSignal()}>Render scale</CardLabel>
          <CardValue theme={themeSignal()}>{() => renderScale().toString()}</CardValue>
        </Card>
      </Grid>
    </Section>
  )
}
