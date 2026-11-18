import { useNow } from '@pyreon/ambient'
import { For, onMount } from '@pyreon/core'
import { formatDate } from '@pyreon/format'
import { computed, signal } from '@pyreon/reactivity'
import type { PlainDate, TimeZone } from '@pyreon/time'
import {
  add,
  dayOfYear,
  endOf,
  monthGrid,
  normalize,
  offsetAt,
  quarterOf,
  startOf,
  toInstant,
  toPlainDateTime,
  useCountdown,
  useToday,
  weekOfYear,
  weekStartOf,
} from '@pyreon/time'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, PaperHint } from '../kit/demo'
import { PaperList, PaperMono, PaperRow, PaperSegmented, PaperText, PaperToggle } from '../kit/demo-parts'
import { Grid } from '../kit/primitives/grid'
import { Stack } from '../kit/primitives/stack'
import { Text } from '../kit/primitives/text'

/** Languages that start the week on three different days (`weekStartOf`). */
const LANGUAGES = { 'en-US': 'English', cs: 'Čeština', ar: 'العربية' } as const
type Language = keyof typeof LANGUAGES

/** Two of these dates are days when the clocks skip an hour (the US on March 8, Europe on March 29). */
const DAYS = { '2026-11-18': 'Nov 18', '2026-03-08': 'Mar 8 (US clocks)', '2026-03-29': 'Mar 29 (EU clocks)' } as const
type Day = keyof typeof DAYS
const TIMES = ['09:00', '02:30'] as const
type Clock = (typeof TIMES)[number]
const ZONES = { 'America/New_York': 'New York', 'Europe/Prague': 'Prague', 'Asia/Tokyo': 'Tokyo' } as const
type Zone = keyof typeof ZONES
const ZONE_LIST = Object.keys(ZONES) as Zone[]

const START: PlainDate = '2026-01-31'

/** UTC+2, UTC-5, UTC+5:30: an offset in minutes east of UTC. */
const offsetLabel = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60

  return `UTC${sign}${h}${m === 0 ? '' : `:${String(m).padStart(2, '0')}`}`
}

/**
 * Time demo (`time.json` → demo): the real `@pyreon/time`. A month grid built
 * with `monthGrid` whose week starts where `weekStartOf(locale)` says, as a
 * WAI-ARIA date grid (arrows, Home, End, Page keys, one tab stop); the
 * arithmetic strip (month math clamps on the 31st); a planner that converts one
 * wall-clock time between three zones, including days with a skipped hour; and
 * live clocks (`useNow`, `useToday`, `useCountdown`).
 *
 * SSR: everything is a fixed date except the clocks, which show a dash until
 * the island mounts (a server has no clock the browser could agree with), so
 * hydration adopts the server HTML.
 */
export default function DemoTime() {
  const lang = signal<Language>('en-US')
  const selected = signal<PlainDate>(START)
  const focused = signal<PlainDate>(START)
  const day = signal<Day>('2026-03-29')
  const clock = signal<Clock>('02:30')
  const from = signal<Zone>('Europe/Prague')
  const ready = signal(false)
  let root: HTMLElement | null = null

  const rtl = () => (lang() === 'ar' ? 'rtl' : 'ltr')
  const weekStart = computed(() => weekStartOf(lang()))
  const month = computed(() => focused().slice(0, 7) as `${number}-${number}`)
  const weeks = computed(() => monthGrid(month(), { weekStart: weekStart(), weeks: 6 }))
  const heads = computed(() => (weeks()[0] ?? []).map((d) => ({ d, label: formatDate(d, { weekday: 'short', locale: lang() }) })))

  const focusDay = (d: PlainDate) => {
    queueMicrotask(() => root?.querySelector<HTMLElement>(`[data-day="${d}"]`)?.focus())
  }
  const move = (d: PlainDate) => {
    focused.set(d)
    focusDay(d)
  }
  const pick = (d: PlainDate) => {
    selected.set(d)
    focused.set(d)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const flip = lang() === 'ar' ? -1 : 1
    const f = focused()
    let next: PlainDate | undefined
    if (e.key === 'ArrowLeft') next = add(f, { days: -flip })
    else if (e.key === 'ArrowRight') next = add(f, { days: flip })
    else if (e.key === 'ArrowUp') next = add(f, { days: -7 })
    else if (e.key === 'ArrowDown') next = add(f, { days: 7 })
    else if (e.key === 'Home') next = startOf(f, 'week', { weekStart: weekStart() })
    else if (e.key === 'End') next = endOf(f, 'week', { weekStart: weekStart() })
    else if (e.key === 'PageUp') next = add(f, e.shiftKey ? { years: -1 } : { months: -1 })
    else if (e.key === 'PageDown') next = add(f, e.shiftKey ? { years: 1 } : { months: 1 })
    if (next !== undefined) {
      e.preventDefault()
      move(next)
    }
  }

  const title = () => formatDate(`${month()}-01`, { month: 'long', year: 'numeric', locale: lang() })
  const sel = () => selected()
  const plusMonth = () => add(sel(), { months: 1 })
  const arithmetic: { label: string; value: () => string }[] = [
    { label: 'Selected', value: () => sel() },
    { label: 'Add 1 month', value: () => plusMonth() },
    { label: 'Add 30 days', value: () => add(sel(), { days: 30 }) },
    { label: 'Start of week', value: () => startOf(sel(), 'week', { weekStart: weekStart() }) },
    { label: 'Start of quarter', value: () => `${startOf(sel(), 'quarter')} (Q${quarterOf(sel())})` },
    { label: 'End of month', value: () => endOf(sel(), 'month') },
    { label: 'ISO week, day of year', value: () => `W${weekOfYear(sel())}, day ${dayOfYear(sel())}` },
  ]

  // The planner: one wall-clock time in one zone, read in three.
  const asked = computed(() => normalize(`${day()}T${clock()}`))
  const instant = computed(() => toInstant(asked(), from()))
  const resolved = computed(() => toPlainDateTime(instant(), from()))
  const skipped = computed(() => resolved() !== asked())

  // The clocks: shared tickers, started on the client only.
  const nowSecond = useNow({ every: 'second' })
  const today = useToday('Asia/Tokyo')
  const countdown = useCountdown('2027-01-01T00:00', { zone: 'Europe/Prague' })
  onMount(() => ready.set(true))
  const dash = '–'
  const left = () => {
    const r = countdown.remaining()

    return `${r.days}d ${r.hours}h ${r.minutes}m ${r.seconds}s`
  }

  return (
    <div
      ref={(e: Element | null) => {
        root = e as HTMLElement | null
      }}
    >
      <DemoGrid>
        <DemoSurface aria-label="Calendar and date arithmetic">
          <Stack gap={200}>
            <PaperSegmented<Language>
              legend="Language (sets the first weekday)"
              options={Object.keys(LANGUAGES) as Language[]}
              value={() => lang()}
              onChange={(v) => lang.set(v)}
              format={(v) => LANGUAGES[v]}
            />
            <Stack gap={100}>
              <Grid columns={3} gap={100}>
                <PaperToggle type="button" aria-label="Previous month" onClick={() => move(add(focused(), { months: -1 }))}>
                  ‹
                </PaperToggle>
                <Text variant="body" medium tone="text" block tag="p" id="time-month" aria-live="polite">
                  {title()}
                </Text>
                <PaperToggle type="button" aria-label="Next month" onClick={() => move(add(focused(), { months: 1 }))}>
                  ›
                </PaperToggle>
              </Grid>
              <div dir={rtl()}>
                <Stack gap={50} role="grid" aria-labelledby="time-month">
                  <Grid columns={7} gap={50} role="row">
                    <For each={() => heads()} by={(h) => h.d}>
                      {(h) => (
                        <span role="columnheader">
                          <Text variant="caption" tone="mist">
                            {h.label}
                          </Text>
                        </span>
                      )}
                    </For>
                  </Grid>
                  <For each={() => weeks()} by={(w) => w[0] ?? ''}>
                    {(w) => (
                      <Grid columns={7} gap={50} role="row">
                        <For each={w} by={(d) => d}>
                          {(d) => (
                            <span role="gridcell" aria-selected={() => (d === selected() ? 'true' : 'false')}>
                              <PaperToggle
                                type="button"
                                data-day={d}
                                aria-label={formatDate(d, { dateStyle: 'full', locale: lang() })}
                                aria-pressed={() => (d === selected() ? 'true' : 'false')}
                                tabIndex={() => (d === focused() ? 0 : -1)}
                                disabled={d.slice(0, 7) !== month()}
                                onClick={() => pick(d)}
                                onKeyDown={onKeyDown}
                              >
                                {d.slice(8).replace(/^0/, '')}
                              </PaperToggle>
                            </span>
                          )}
                        </For>
                      </Grid>
                    )}
                  </For>
                </Stack>
              </div>
              <PaperHint>Arrow keys move, Home and End jump to the week's edges, Page keys change month (Shift: year).</PaperHint>
            </Stack>
            <PaperList aria-label="Date arithmetic on the selected day">
              <For each={arithmetic} by={(r) => r.label}>
                {(r) => (
                  <PaperRow tag="li">
                    <PaperText>{r.label}</PaperText>
                    <PaperMono>{r.value()}</PaperMono>
                  </PaperRow>
                )}
              </For>
            </PaperList>
            <PaperHint aria-live="polite">
              {() => (plusMonth().slice(8) !== sel().slice(8) ? `The ${sel().slice(8)}th does not exist next month: the day clamps to ${plusMonth().slice(8)}.` : 'Pick the 31st to see month math clamp.')}
            </PaperHint>
          </Stack>
        </DemoSurface>
        <DemoSurface aria-label="Meeting planner and clocks">
          <Stack gap={200}>
            <PaperSegmented<Day>
              legend="Day"
              options={Object.keys(DAYS) as Day[]}
              value={() => day()}
              onChange={(v) => day.set(v)}
              format={(v) => DAYS[v]}
            />
            <PaperSegmented<Clock> legend="Wall-clock time" options={TIMES} value={() => clock()} onChange={(v) => clock.set(v)} />
            <PaperSegmented<Zone>
              legend="In this zone"
              options={ZONE_LIST}
              value={() => from()}
              onChange={(v) => from.set(v)}
              format={(v) => ZONES[v]}
            />
            <PaperList aria-label="The same moment in three time zones">
              <For each={ZONE_LIST} by={(z) => z}>
                {(z) => (
                  <PaperRow tag="li">
                    <PaperText>{ZONES[z]}</PaperText>
                    <PaperMono>{`${toPlainDateTime(instant(), z as TimeZone)} · ${offsetLabel(offsetAt(instant(), z as TimeZone))}`}</PaperMono>
                  </PaperRow>
                )}
              </For>
            </PaperList>
            <PaperHint aria-live="polite">
              {() =>
                skipped()
                  ? `${asked().slice(11)} does not exist on ${asked().slice(0, 10)} in ${ZONES[from()]}: the clocks skip an hour, so it resolves to ${resolved().slice(11)}.`
                  : 'Every wall-clock time exists on this day: no hour is skipped.'
              }
            </PaperHint>
            <PaperList aria-label="Live clocks">
              <PaperRow tag="li">
                <PaperText>Now in Prague</PaperText>
                <PaperMono>{() => (ready() ? toPlainDateTime(nowSecond(), 'Europe/Prague') : dash)}</PaperMono>
              </PaperRow>
              <PaperRow tag="li">
                <PaperText>Today in Tokyo</PaperText>
                <PaperMono>{() => (ready() ? today() : dash)}</PaperMono>
              </PaperRow>
              <PaperRow tag="li">
                <PaperText>New Year in Prague</PaperText>
                <PaperMono>{() => (ready() ? left() : dash)}</PaperMono>
              </PaperRow>
            </PaperList>
            <PaperHint>Three clocks, two shared timers: one per granularity, not one per reader.</PaperHint>
          </Stack>
        </DemoSurface>
      </DemoGrid>
    </div>
  )
}
