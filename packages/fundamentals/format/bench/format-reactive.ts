/**
 * The reactive cost, two operations.
 *
 * 1. 1,000 text bindings that format a signal, ONE locale switch.
 * 2. 1,000 relative-time labels, ONE clock tick (`useRelativeTime` against the shared ambient clock, vs a signal-driven
 *    `i18n.rt`, a cached `Intl.RelativeTimeFormat` and a fresh one per call).
 *
 * Time to update all of them, per binding, for (1):
 *  - @pyreon/format: `formatNumber(v)` in an effect (it reads the active locale),
 *  - @pyreon/i18n: `i18n.n(v)` in an effect (it reads `i18n.locale()`), the way
 *    i18n formats today,
 *  - raw cached Intl in an effect (a `Map` of `Intl.NumberFormat` per locale, the
 *    locale in a signal): the floor,
 *  - `v.toLocaleString(locale())` in an effect.
 *
 * Each binding is an effect that writes its text into an array, so the number
 * measured is the subscription and formatting cost, NOT DOM writes (which are
 * identical for every arm). A switch alternates between two locales, so every
 * call re-formats all 1,000 values. Same measurement contract and run commands as
 * `format-rivals.ts` (`bun run bench:reactive` for V8, run it under bun for JSC).
 */
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'

// `isServer` is a module-load constant: define a document global BEFORE any
// Pyreon module loads so the client path (live setLocale, effects) is the one measured.
Reflect.set(globalThis, 'document', {})
const { effect, effectScope, signal } = await import('@pyreon/reactivity')
const reactive = await import('../lib/index.js')
const ambient = await import('@pyreon/ambient')
const ambientTesting = await import('@pyreon/ambient/testing')
const { createI18n } = await import('@pyreon/i18n')

type Id = 'pyreon' | 'i18n' | 'raw-cached' | 'tolocale'

const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: '@pyreon/format (formatNumber in an effect)' },
  { id: 'i18n', label: '@pyreon/i18n (i18n.n in an effect)' },
  { id: 'raw-cached', label: 'raw cached Intl in an effect', ranking: false },
  { id: 'tolocale', label: 'toLocaleString in an effect' },
]

const BINDINGS = 1000
const LOCALES = ['en-US', 'de'] as const
const values = Array.from({ length: BINDINGS }, (_, i) => (i + 1) * 1234.5678 + (i % 7) * 0.25)

const expected = (locale: string): string[] => {
  const f = new Intl.NumberFormat(locale)
  return values.map((v) => f.format(v))
}

let sink = ''

// ─── operation 2: one clock tick across 1,000 relative labels ───────────────────────────────────────────────────────────
const LABELS = 1000
const T0 = Date.UTC(2026, 10, 18, 12)
// Ages from 37 s to 30 minutes, so every label is in the seconds or minutes tier and changes text as the clock advances.
const targets = Array.from({ length: LABELS }, (_, i) => T0 - ((i % 49) + 1) * 37_000)
const TICK_MS = 1000

/** The words a person would say, from raw Intl: the independent check of every arm. */
const relativeExpected = (target: number, at: number): string => {
  const away = target - at
  const abs = Math.abs(away)
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

  return abs < 60_000 ? rtf.format(Math.trunc(away / 1000), 'second') : rtf.format(Math.trunc(away / 60_000), 'minute')
}

interface TickFixture {
  /** Advance the clock one tick; every label has re-computed when it returns. */
  tick(): void
  text(): string[]
  at(): number
}

function buildTick(arm: Id): TickFixture {
  const out: string[] = new Array(LABELS).fill('')
  let clock = T0
  const at = (): number => clock
  if (arm === 'pyreon') {
    ambientTesting._resetClockState()
    ambient.setClock(at)
    const scope = effectScope()

    scope.runInScope(() => {
      for (let i = 0; i < LABELS; i++) {
        const ago = reactive.useRelativeTime(targets[i] as number, { locale: 'en-US', timeZone: 'UTC' })

        effect(() => {
          out[i] = ago()
        })
      }
    })

    return {
      tick: () => {
        clock += TICK_MS
        ambientTesting._fireAll()
      },
      text: () => out,
      at,
    }
  }
  const now = signal(clock)
  const advance = (): void => {
    clock += TICK_MS
    now.set(clock)
  }
  if (arm === 'i18n') {
    const i18n = createI18n({ locale: 'en-US', messages: { 'en-US': {} } })

    for (let i = 0; i < LABELS; i++) {
      effect(() => {
        const away = (targets[i] as number) - now()

        out[i] = Math.abs(away) < 60_000 ? i18n.rt(Math.trunc(away / 1000), 'second') : i18n.rt(Math.trunc(away / 60_000), 'minute')
      })
    }

    return { tick: advance, text: () => out, at }
  }
  const cached = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
  const make = arm === 'raw-cached' ? (): Intl.RelativeTimeFormat => cached : (): Intl.RelativeTimeFormat => new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

  for (let i = 0; i < LABELS; i++) {
    effect(() => {
      const away = (targets[i] as number) - now()
      const rtf = make()

      out[i] = Math.abs(away) < 60_000 ? rtf.format(Math.trunc(away / 1000), 'second') : rtf.format(Math.trunc(away / 60_000), 'minute')
    })
  }

  return { tick: advance, text: () => out, at }
}

interface Fixture {
  /** Switch to the next locale; every binding has re-formatted when it returns. */
  toggle(): void
  /** The text of every binding right now. */
  text(): string[]
  /** The locale the fixture believes is active. */
  active(): string
}

function build(arm: Id): Fixture {
  const out: string[] = new Array(BINDINGS).fill('')
  let at = 0
  const next = (): string => LOCALES[++at % LOCALES.length] as string
  let current: string = LOCALES[0]
  if (arm === 'pyreon') {
    reactive.setLocale(current)
    for (let i = 0; i < BINDINGS; i++) {
      effect(() => {
        out[i] = reactive.formatNumber(values[i])
      })
    }

    return { toggle: () => reactive.setLocale((current = next())), text: () => out, active: () => current }
  }
  if (arm === 'i18n') {
    const i18n = createI18n({ locale: current, messages: { [LOCALES[0]]: {}, [LOCALES[1]]: {} } })
    for (let i = 0; i < BINDINGS; i++) {
      effect(() => {
        out[i] = i18n.n(values[i] as number)
      })
    }

    return { toggle: () => i18n.locale.set((current = next())), text: () => out, active: () => current }
  }
  const locale = signal<string>(current)
  if (arm === 'raw-cached') {
    const formats = new Map<string, Intl.NumberFormat>()
    for (let i = 0; i < BINDINGS; i++) {
      effect(() => {
        const l = locale()
        let f = formats.get(l)
        if (f === undefined) formats.set(l, (f = new Intl.NumberFormat(l)))
        out[i] = f.format(values[i] as number)
      })
    }
  } else {
    for (let i = 0; i < BINDINGS; i++) {
      effect(() => {
        out[i] = (values[i] as number).toLocaleString(locale())
      })
    }
  }

  return { toggle: () => locale.set((current = next())), text: () => out, active: () => current }
}

await runRivalBench<Id>({
  title: '1,000 formatted bindings (one locale switch) and 1,000 relative labels (one clock tick): @pyreon/format vs @pyreon/i18n vs raw Intl vs toLocaleString',
  file: process.argv[1] as string,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  unit: 'ns/binding',
  ops: {
    'locale switch, 1000 bindings': {
      note: 'per binding; each call switches en-US <-> de and re-formats all 1,000 effects',
      warmup: 20,
      iters: 60,
      runs: 11,
      divide: BINDINGS,
      make: (arm) => {
        const fx = build(arm)

        return () => {
          fx.toggle()
          sink = fx.text()[7] as string
        }
      },
    },
    'clock tick, 1000 relative labels': {
      note: 'per label; each call advances the clock one second and re-computes all 1,000 labels (pyreon: useRelativeTime on the shared ambient clock, every ticker published once; the others: a signal-driven effect)',
      warmup: 20,
      iters: 60,
      runs: 11,
      divide: LABELS,
      make: (arm) => {
        const fx = buildTick(arm)

        return () => {
          fx.tick()
          sink = fx.text()[7] as string
        }
      },
    },
  },
  gate: () => {
    // Operation 2: after every tick all 1,000 labels equal what raw Intl says for the clock, in every arm.
    for (const arm of ARMS) {
      const fx = buildTick(arm.id)

      for (let s = 0; s < 4; s++) {
        fx.tick()
        const got = fx.text()

        for (let i = 0; i < LABELS; i++) {
          const want = relativeExpected(targets[i] as number, fx.at())

          if (got[i] !== want) throw new Error(`[Pyreon] [format-reactive] relative ${arm.id}: tick ${s}, label ${i}: ${JSON.stringify(got[i])} !== ${JSON.stringify(want)}`)
        }
      }
    }
    // Operation 1. Each arm, in its own fixture: after every switch ALL 1,000 bindings equal the raw Intl text for the active locale.
    for (const arm of ARMS) {
      const fx = build(arm.id)
      for (let s = 0; s < 4; s++) {
        fx.toggle()
        const want = expected(fx.active())
        const got = fx.text()
        for (let i = 0; i < BINDINGS; i++) {
          if (got[i] !== want[i]) throw new Error(`[Pyreon] [format-reactive] ${arm.id}: switch ${s}, binding ${i}: ${JSON.stringify(got[i])} !== ${JSON.stringify(want[i])}`)
        }
      }
    }
  },
  footnotes: [
    'Bindings are effects writing to an array: the DOM write is identical for every arm and excluded. A locale switch is one signal write that re-runs every subscribed effect.',
    'In the @pyreon/format arm every effect calls the reactive entry, which reads the locale signal once per call; in the @pyreon/i18n arm every effect calls i18n.n, which reads i18n.locale().',
    'In the relative-label op the @pyreon/format arm does MORE work per label than the others by design: it re-reads its cadence, may move to a new one-shot, and applies the calendar rules; the others only format. It is the cost of a label that schedules itself.',
    'This is the author-judge and a synthetic loop, not a real app.',
  ],
})
