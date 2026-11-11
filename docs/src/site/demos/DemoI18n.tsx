import { For } from '@pyreon/core'
import { createI18n, resolvePluralCategory } from '@pyreon/i18n'
import { computed, signal } from '@pyreon/reactivity'
import { font, paper, radius, text, weight } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, PaperField, PaperHint, PaperLabel } from '../kit/demo'
import { Code, Eyebrow } from '../kit/type'
import { PaperToggle, ToggleRow } from './_toggle-b'

type Locale = 'en' | 'cs' | 'pl' | 'de' | 'ar'

const LANGS = [
  { code: 'en', label: 'English', currency: 'USD' },
  { code: 'cs', label: 'Čeština', currency: 'CZK' },
  { code: 'pl', label: 'Polski', currency: 'PLN' },
  { code: 'de', label: 'Deutsch', currency: 'EUR' },
  { code: 'ar', label: 'العربية', currency: 'SAR' },
] as const satisfies readonly { code: Locale; label: string; currency: string }[]


/** Each language lists only the plural forms it has (plus an explicit `_zero`). */
const MESSAGES: Record<Locale, Record<string, string>> = {
  en: { files_zero: 'No files', files_one: '{{count, number}} file', files_other: '{{count, number}} files' },
  cs: {
    files_zero: 'Žádné soubory',
    files_one: '{{count, number}} soubor',
    files_few: '{{count, number}} soubory',
    files_many: '{{count, number}} souboru',
    files_other: '{{count, number}} souborů',
  },
  pl: {
    files_zero: 'Brak plików',
    files_one: '{{count, number}} plik',
    files_few: '{{count, number}} pliki',
    files_many: '{{count, number}} plików',
    files_other: '{{count, number}} pliku',
  },
  de: { files_zero: 'Keine Dateien', files_one: '{{count, number}} Datei', files_other: '{{count, number}} Dateien' },
  ar: {
    files_zero: 'لا ملفات',
    files_one: 'ملف واحد',
    files_two: 'ملفان',
    files_few: '{{count, number}} ملفات',
    files_many: '{{count, number}} ملفًا',
    files_other: '{{count, number}} ملف',
  },
}

const TRY = ['0', '1', '2', '5', '22', '1.5'] as const

/** A fixed date (rendered in UTC) so the server render and the first client render agree. */
const RELEASE = Date.UTC(2026, 2, 14, 12)

const Stack = el.config({ name: 'I18nStack' }).attrs({ block: true, gap: 14, contentAlignX: 'block' })

const Output = txt
  .config({ name: 'I18nOutput' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, minHeight: 34, fontFamily: font.sans, fontSize: 24, fontWeight: weight.semibold, color: paper.text, overflowWrap: 'anywhere' }))

const Category = txt
  .config({ name: 'I18nCategory' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, fontSize: 13, color: paper.mist }))

const KeyList = el
  .config({ name: 'I18nKeys' })
  .attrs({ tag: 'ul', block: true, gap: 6 })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))

const KeyRow = el
  .config({ name: 'I18nKey' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 9em) minmax(0, 1fr)',
    gap: 10,
    alignItems: 'baseline',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.note,
    backgroundColor: tone(m, 'well'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'fog'),
    transition: 'border-color .2s, background-color .2s, color .2s',
    extendCss: '@media (prefers-reduced-motion: reduce) { transition: none; } & > span { overflow-wrap: anywhere; min-width: 0; }',
  }))
  .states((_t, m) => ({
    idle: {},
    picked: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'text') },
  }))

const FmtRow = el
  .config({ name: 'I18nFormat' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' },
    gap: 4,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.note,
    backgroundColor: tone(m, 'well'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'mist'),
  }))

const FmtValue = txt
  .config({ name: 'I18nFormatValue' })
  .attrs({ tag: 'b' })
  .theme((_t, m) => ({ fontFamily: font.sans, fontSize: 19, fontWeight: weight.medium, color: tone(m, 'text'), overflowWrap: 'anywhere' }))

/**
 * i18n demo (`i18n.json` → demo): a real `createI18n` instance from
 * `@pyreon/i18n`. Switching the language is `i18n.locale.set()`; the output
 * is `t('files', { count })`, so the package asks `Intl.PluralRules` (via
 * `resolvePluralCategory`, also shown) for the category and picks
 * `files_few`, `files_many`, … The formatter rows are `n` / `d` / `rt` on
 * the same instance and re-format for the new locale.
 */
export default function DemoI18n() {
  const i18n = createI18n({
    locale: 'cs',
    fallbackLocale: 'en',
    messages: MESSAGES,
    numberFormats: Object.fromEntries(
      LANGS.map((l) => [l.code, { currency: { style: 'currency', currency: l.currency }, percent: { style: 'percent' } }]),
    ),
    dateFormats: Object.fromEntries(LANGS.map((l) => [l.code, { long: { dateStyle: 'long', timeZone: 'UTC' } }])),
  })
  // The raw input text (so typing "1." is not rewritten to "1"); the count parses it.
  const raw = signal('3')
  const count = computed(() => {
    const n = Number.parseFloat(raw())
    return Number.isFinite(n) && n >= 0 ? n : 0
  })
  const locale = () => i18n.locale() as Locale
  const category = computed(() => resolvePluralCategory(locale(), count()))
  // The key t() resolved: the same candidate order the package documents
  // (`_zero` for 0, then the CLDR category, then `_other`).
  const pickedKey = computed(() => {
    const dict = MESSAGES[locale()]
    const tails = [...(count() === 0 ? ['zero'] : []), category(), 'other']
    const tail = tails.find((t) => `files_${t}` in dict) ?? 'other'
    return `files_${tail}`
  })
  const keys = computed(() => Object.keys(MESSAGES[locale()]))
  const formats = [
    { label: "n(1234.5, 'currency')", value: () => i18n.n(1234.5, 'currency') },
    { label: "d(date, 'long')", value: () => i18n.d(RELEASE, 'long') },
    { label: "rt(-3, 'day')", value: () => i18n.rt(-3, 'day') },
    { label: "n(0.42, 'percent')", value: () => i18n.n(0.42, 'percent') },
  ]

  return (
    <DemoGrid>
      <DemoSurface aria-label="Translated file counter">
        <Stack>
          <div>
            <PaperLabel id="i18n-demo-lang">Language</PaperLabel>
            <ToggleRow role="group" aria-labelledby="i18n-demo-lang">
              <For each={LANGS} by={(l) => l.code}>
                {(l) => (
                  <PaperToggle
                    type="button"
                    lang={l.code}
                    aria-pressed={() => (locale() === l.code ? 'true' : 'false')}
                    onClick={() => i18n.locale.set(l.code)}
                  >
                    {l.label}
                  </PaperToggle>
                )}
              </For>
            </ToggleRow>
          </div>
          <div>
            <PaperLabel for="i18n-demo-count">Files</PaperLabel>
            <PaperField>
              <input
                id="i18n-demo-count"
                type="number"
                min="0"
                max="1000"
                step="any"
                inputMode="decimal"
                value={() => raw()}
                onInput={(e: Event) => raw.set((e.target as HTMLInputElement).value)}
              />
            </PaperField>
            <PaperHint id="i18n-demo-try">Try a count:</PaperHint>
            <ToggleRow role="group" aria-labelledby="i18n-demo-try">
              <For each={TRY} by={(v) => v}>
                {(v) => (
                  <PaperToggle type="button" aria-pressed={() => (raw() === v ? 'true' : 'false')} onClick={() => raw.set(v)}>
                    {v}
                  </PaperToggle>
                )}
              </For>
            </ToggleRow>
          </div>
          <div>
            <Output aria-live="polite" lang={locale()} dir={i18n.dir()}>
              {() => i18n.t('files', { count: count() })}
            </Output>
            <Category>
              plural category: <b>{() => category()}</b>
              {() => (pickedKey() === 'files_zero' && category() !== 'zero' ? ' (explicit _zero)' : '')}
            </Category>
          </div>
        </Stack>
      </DemoSurface>
      <DemoPanel note="The category comes from Intl.PluralRules; each language lists only the forms it has. The formatters are memoized per locale and options.">
        <Stack>
          <div>
            <Eyebrow>{() => `messages · ${locale()}`}</Eyebrow>
            <KeyList aria-label="Message keys for the current language">
              <For each={() => keys()} by={(k) => k}>
                {(k) => (
                  // The compiler wraps these reads in _rp(), so the row re-styles when the pick moves.
                  // pyreon-lint-disable-next-line pyreon/no-signal-in-props
                  <KeyRow state={pickedKey() === k ? 'picked' : 'idle'} aria-current={() => (pickedKey() === k ? 'true' : undefined)}>
                    <span>
                      <Code>{k}</Code>
                    </span>
                    <span lang={locale()} dir={i18n.dir()}>
                      {() => MESSAGES[locale()][k] ?? ''}
                    </span>
                  </KeyRow>
                )}
              </For>
            </KeyList>
          </div>
          <div>
            <Eyebrow>formatters</Eyebrow>
            <KeyList aria-label="Formatters for the current language">
              <For each={formats} by={(f) => f.label}>
                {(f) => (
                  <FmtRow>
                    <span>{f.label}</span>
                    <FmtValue lang={locale()}>{() => f.value()}</FmtValue>
                  </FmtRow>
                )}
              </For>
            </KeyList>
          </div>
        </Stack>
      </DemoPanel>
    </DemoGrid>
  )
}
