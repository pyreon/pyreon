/**
 * The reactive cost: 1,000 text bindings that format a signal, ONE locale switch.
 * Time to update all of them, per binding, for:
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
const { effect, signal } = await import('@pyreon/reactivity')
const reactive = await import('../lib/index.js')
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
  title: '1,000 formatted bindings, one locale switch: @pyreon/format vs @pyreon/i18n vs raw Intl vs toLocaleString',
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
  },
  gate: () => {
    // Each arm, in its own fixture: after every switch ALL 1,000 bindings equal the raw Intl text for the active locale.
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
    'This is the author-judge and a synthetic loop, not a real app.',
  ],
})
