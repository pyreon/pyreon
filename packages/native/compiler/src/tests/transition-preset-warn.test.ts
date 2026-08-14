// `<Transition name>` maps a handful of preset names onto each platform's own
// transition, and anything else falls back to a fade. The fallback is correct
// — a custom CSS animation has no native translation, and refusing to compile
// over a decorative transition would be worse — but it was SILENT.
//
// That silence is the bug. On the web the author's `${name}-enter-*` CSS runs;
// on device it fades. The animation still plays, so there is no symptom to
// investigate — the exact property that let the original "every transition is
// a fade" bug survive until someone happened to compare platforms.
//
// The list of translatable names lives in ONE module consumed by both
// emitters, so a name can never be known to Swift and unknown to Kotlin —
// which would itself be a per-platform animation divergence.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  KNOWN_TRANSITION_PRESETS,
  normalizePresetName,
  unknownTransitionPresetWarning,
} from '../transition-presets'

const app = (name: string) => `
  import { Stack, Text, Transition } from '@pyreon/primitives'
  export function C() {
    return (<Stack><Transition name="${name}"><Text>x</Text></Transition></Stack>)
  }
`

const warnsFor = (name: string, target: 'swift' | 'kotlin') =>
  (transform(app(name), { target }).warnings ?? []).filter((w) => w.includes('<Transition name='))

describe('an untranslatable <Transition name> says so', () => {
  it.each(['bounce', 'zoom-in', 'flip', 'my-custom-anim'])(
    '%s warns on BOTH targets',
    (name) => {
      for (const target of ['swift', 'kotlin'] as const) {
        const w = warnsFor(name, target)
        expect(w, `${name} on ${target}`).toHaveLength(1)
        expect(w[0]).toContain(name)
        // The message must name the actual divergence, not just "unsupported":
        // the point is that the two platforms animate DIFFERENTLY.
        expect(w[0]).toContain('FADE')
        expect(w[0]).toContain('slide-up')
      }
    },
  )

  it.each(['fade', 'scale-in', 'slide-up', 'slide-down', 'slide-left', 'slide-right'])(
    'a translatable name (%s) stays silent',
    (name) => {
      expect(warnsFor(name, 'swift')).toHaveLength(0)
      expect(warnsFor(name, 'kotlin')).toHaveLength(0)
    },
  )

  it('accepts camelCase spellings without warning', () => {
    // @pyreon/kinetic names its presets camelCase; the web class convention is
    // kebab-case. Warning on one spelling would push authors toward the other
    // for the wrong reason.
    for (const name of ['slideUp', 'scaleIn', 'slideRight']) {
      expect(warnsFor(name, 'swift'), name).toHaveLength(0)
      expect(warnsFor(name, 'kotlin'), name).toHaveLength(0)
    }
  })

  it('warns ONCE even on the asymmetric-timing path', () => {
    // Kotlin resolves the name twice there (enter spec + exit spec); warning
    // inside that helper would double-report.
    const src = `
      import { Stack, Text, Transition } from '@pyreon/primitives'
      export function C() {
        return (<Stack><Transition name="bounce" enterDuration={200} leaveDuration={400}><Text>x</Text></Transition></Stack>)
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const w = (transform(src, { target }).warnings ?? []).filter((x) =>
        x.includes('<Transition name='),
      )
      expect(w, target).toHaveLength(1)
    }
  })

  it('a Transition with NO name never warns', () => {
    const src = `
      import { Stack, Text, Transition } from '@pyreon/primitives'
      export function C() { return (<Stack><Transition><Text>x</Text></Transition></Stack>) }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      expect((transform(src, { target }).warnings ?? []).join('')).not.toContain('<Transition name=')
    }
  })

  it('still EMITS the fade — this warns, it does not refuse', () => {
    // The behaviour is deliberate and unchanged; only the silence is fixed.
    expect(transform(app('bounce'), { target: 'swift' }).code).toContain('.transition(.opacity)')
    expect(transform(app('bounce'), { target: 'kotlin' }).code).toContain('fadeIn(')
  })
})

describe('the shared preset list', () => {
  it('normalizes every spelling to the same key', () => {
    expect(normalizePresetName('slide-up')).toBe('slideup')
    expect(normalizePresetName('slideUp')).toBe('slideup')
    expect(normalizePresetName('slide_up')).toBe('slideup')
    expect(normalizePresetName(undefined)).toBe('')
  })

  it('every listed preset is genuinely translatable on both targets', () => {
    // Guards the list against drifting away from the emitters: an entry here
    // that no emitter maps would silence a warning the author should see.
    for (const key of KNOWN_TRANSITION_PRESETS) {
      expect(unknownTransitionPresetWarning(key)).toBeUndefined()
      expect(warnsFor(key, 'swift'), key).toHaveLength(0)
      expect(warnsFor(key, 'kotlin'), key).toHaveLength(0)
    }
  })
})
