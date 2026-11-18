import { For, onMount } from '@pyreon/core'
import {
  currencyFormatter,
  formatBytes,
  formatCompact,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatDuration,
  formatList,
  formatNumber,
  formatPercent,
  formatRelativeTo,
  formatUnit,
  parseNumber,
  provideLocale,
  provideTimeZone,
} from '@pyreon/format'
import { RelativeTime } from '@pyreon/format/components'
import { computed, signal } from '@pyreon/reactivity'
import { DemoSurface } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { DemoGrid, DemoPanel, Meters, PaperField, PaperHint, PaperLabel } from '../kit/demo'
import { PaperList, PaperRow, PaperSegmented, PaperText } from '../kit/demo-parts'
import { Stack } from '../kit/primitives/stack'

/** The languages on offer: a BCP 47 tag, written in its own language. */
const LANGUAGES = {
  'en-US': 'English',
  cs: 'Čeština',
  de: 'Deutsch',
  ja: '日本語',
  ar: 'العربية',
  hi: 'हिन्दी',
} as const
type Language = keyof typeof LANGUAGES

const ZONES = {
  UTC: 'UTC',
  'America/Los_Angeles': 'Los Angeles',
  'Europe/Prague': 'Prague',
  'Asia/Tokyo': 'Tokyo',
  'Pacific/Kiritimati': 'Kiritimati',
} as const
type Zone = keyof typeof ZONES

/** A fixed moment (UTC), so the server render and the first client render agree. */
const STANDUP = '2026-11-18T23:30:00Z'
const NOW = Date.UTC(2026, 10, 18, 12, 0)
const SOON = Date.UTC(2026, 10, 18, 12, 5)

/** A formatter is a value: `.from()` adapts the input, so the price can stay in cents. */
const fromCents = currencyFormatter('EUR').from((cents: number) => cents / 100)

const SOURCE = `provideLocale(() => lang())
provideTimeZone(() => zone())

// every row is one call, with no locale in sight
formatCurrency(1234.5, 'EUR')
formatDate('2026-11-18', 'long')
formatDateTime('2026-11-18T23:30:00Z')

const fromCents = currencyFormatter('EUR').from((c: number) => c / 100)
fromCents(123456)
<RelativeTime value={postedAt()} />
parseNumber(typed(), { locale: lang() })`

type RowProps = {
  label: string
  value: () => string
  rtl: () => 'rtl' | 'ltr'
  lang: () => string
  ran: () => void
}

/** One labelled value. The body runs once; only the text node inside changes. */
function Row(props: RowProps) {
  props.ran()
  return (
    <PaperRow tag="li">
      <PaperText>{props.label}</PaperText>
      <bdi lang={props.lang()} dir={props.rtl()}>
        {props.value()}
      </bdi>
    </PaperRow>
  )
}

type PostedProps = { label: string; at: () => number; ready: () => boolean; rtl: () => 'rtl' | 'ltr'; lang: () => string; ran: () => void }

/** The label that updates itself. It starts after mount: the server has no clock to agree with. */
function Posted(props: PostedProps) {
  props.ran()
  return (
    <PaperRow tag="li">
      <PaperText>{props.label}</PaperText>
      <bdi lang={props.lang()} dir={props.rtl()}>
        {() => (props.ready() ? <RelativeTime value={props.at()} /> : '–')}
      </bdi>
    </PaperRow>
  )
}

/**
 * Format demo (`format.json` → demo): the real `@pyreon/format` reactive entry.
 * One `provideLocale(() => lang())` and one `provideTimeZone(() => zone())` in
 * the root drive every value: a switch changes two signals and each value
 * rewrites its own text node. The meter counts how many row components ran;
 * it stays at 14 however often the language changes.
 *
 * SSR: `provideLocale` is request-scoped on the server, and the first render
 * is en-US in UTC on both sides, so hydration adopts the server HTML. Every
 * input is a fixed value (no clock), so nothing differs between renders.
 */
export default function DemoFormat() {
  const lang = signal<Language>('en-US')
  const zone = signal<Zone>('UTC')
  const typed = signal('1,234.5')
  const ready = signal(false)
  const postedAt = signal(0)
  let ran = 0

  provideLocale(() => lang())
  provideTimeZone(() => zone())

  // Posted 57 seconds before the page woke up: the label flips to "1 minute ago" three seconds later, by itself.
  onMount(() => {
    postedAt.set(Date.now() - 57_000)
    ready.set(true)
  })

  const rtl = () => (lang() === 'ar' ? 'rtl' : 'ltr')
  const parsed = computed(() => parseNumber(typed(), { locale: lang() }))

  const rows: { label: string; value: () => string }[] = [
    { label: 'Price', value: () => formatCurrency(1234.5, 'EUR') },
    { label: 'Price from cents', value: () => fromCents(123456) },
    { label: 'Audience', value: () => formatCompact(1_240_000) },
    { label: 'Conversion', value: () => formatPercent(0.427, { maximumFractionDigits: 1 }) },
    { label: 'File size', value: () => formatBytes(7_340_032) },
    { label: 'Speed', value: () => formatUnit(72, 'kilometer-per-hour') },
    { label: 'Duration', value: () => formatDuration(3_905_000) },
    { label: 'List', value: () => formatList(['Prague', 'Tokyo', 'Lima']) },
    { label: 'Calendar date', value: () => formatDate('2026-11-18', 'long') },
    { label: 'Date range', value: () => formatDateRange('2026-11-12', '2026-11-15') },
    { label: 'Instant (follows the zone)', value: () => formatDateTime(STANDUP) },
    { label: 'Wall-clock time (never shifts)', value: () => formatDateTime('2026-11-18T14:30') },
    { label: 'Relative time', value: () => formatRelativeTo(SOON, NOW) },
  ]

  return (
    <DemoGrid>
      <DemoSurface aria-label="Formatting playground">
        <Stack gap={200}>
          <PaperSegmented<Language>
            legend="Language"
            options={Object.keys(LANGUAGES) as Language[]}
            value={() => lang()}
            onChange={(v) => lang.set(v)}
            format={(v) => LANGUAGES[v]}
          />
          <PaperSegmented<Zone>
            legend="Time zone"
            options={Object.keys(ZONES) as Zone[]}
            value={() => zone()}
            onChange={(v) => zone.set(v)}
            format={(v) => ZONES[v]}
          />
          <PaperList aria-label="Formatted values">
            <For each={rows} by={(r) => r.label}>
              {(r) => <Row label={r.label} value={r.value} rtl={rtl} lang={() => lang()} ran={() => (ran += 1)} />}
            </For>
            <Posted label="Posted" at={() => postedAt()} ready={() => ready()} rtl={rtl} lang={() => lang()} ran={() => (ran += 1)} />
          </PaperList>
          <div>
            <PaperLabel for="format-typed">Type a number</PaperLabel>
            <PaperField>
              <input
                id="format-typed"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={typed()}
                aria-describedby="format-parsed"
                onInput={(e: Event) => typed.set((e.target as HTMLInputElement).value)}
              />
            </PaperField>
            <PaperHint id="format-parsed" aria-live="polite">
              {() =>
                parsed() === null
                  ? 'parseNumber → null: not a number in this language.'
                  : `parseNumber → ${String(parsed())}, printed back as ${formatNumber(parsed())}`}
            </PaperHint>
            <PaperHint>Try 1,234.5 or 1.234,5 or 1 234,5, then change the language.</PaperHint>
          </div>
        </Stack>
      </DemoSurface>
      <DemoPanel note="Two signals and two provide calls drive every value. Switch the language and each value rewrites its own text node; the row components do not run again.">
        <Stack gap={200}>
          <CodeBlock code={SOURCE} label="The wiring" />
          <Meters
            label="What the switch touches"
            items={[
              { label: 'locale', value: () => lang() },
              { label: 'time zone', value: () => zone() },
              { label: 'row components that ran', value: () => ran },
            ]}
          />
        </Stack>
      </DemoPanel>
    </DemoGrid>
  )
}
