/**
 * `<Video controls>` was typed and documented on all three targets and honoured
 * on none. Neither native runtime took the parameter, and the Kotlin one
 * hardcoded `useController = true`, so `controls={false}` had nowhere to land —
 * typed-but-unimplemented all the way down: type → emit → runtime.
 *
 * Its siblings `autoPlay` / `loop` / `muted` all lowered. `controls` is the one
 * that DEFAULTS TO TRUE, which is why it is emitted when explicitly FALSE and
 * why writing it required touching the runtimes rather than only the emitter —
 * and, most likely, why it was the sibling that got skipped.
 *
 * The amount of work behind it is asymmetric even though the prop is not:
 * Compose's `PlayerView.useController` is a plain boolean, while AVKit's
 * `VideoPlayer` ALWAYS draws transport controls, so the Swift runtime needed an
 * `AVPlayerLayer`-backed representable for the chrome-less case.
 */

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (attrs: string): string =>
  `import { Stack, Video } from '@pyreon/primitives'
export function C() { return <Stack><Video src="https://x.test/a.mp4"${attrs} /></Stack> }`

const emit = (attrs: string, target: 'swift' | 'kotlin'): string =>
  transform(app(attrs), { target }).code

describe('<Video controls>', () => {
  it('swift passes controls: false', () => {
    expect(emit(' controls={false}', 'swift')).toContain('controls: false')
  })

  it('kotlin passes controls = false', () => {
    expect(emit(' controls={false}', 'kotlin')).toContain('controls = false')
  })

  it.each(['swift', 'kotlin'] as const)('%s emits NOTHING for controls={true}', (target) => {
    // The runtime default. Emitting it would be noise, and would make the
    // absent case and the explicit-true case differ for no reason.
    expect(emit(' controls={true}', target)).not.toContain('controls')
  })

  it.each(['swift', 'kotlin'] as const)('%s is byte-identical when absent', (target) => {
    expect(emit(' controls={true}', target)).toBe(emit('', target))
  })

  it('rides alongside its siblings rather than replacing them', () => {
    const out = emit(' autoPlay loop muted controls={false}', 'kotlin')
    for (const arg of ['autoPlay = true', 'loop = true', 'muted = true', 'controls = false']) {
      expect(out).toContain(arg)
    }
  })

  it('does NOT leak onto <Audio>, which has no such prop', () => {
    // The two emitters are near-copies and sit next to each other; the first
    // attempt at this landed in the audio one.
    const audio = `import { Stack, Audio } from '@pyreon/primitives'
export function C() { return <Stack><Audio src="https://x.test/a.mp3" /></Stack> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(audio, { target }).code).not.toContain('controls')
    }
  })
})

const FORMS = ['', ' controls={false}', ' controls={true}', ' autoPlay loop muted controls={false}']

describe.runIf(isSwiftcAvailable())('Swift — compiles', () => {
  it.each(FORMS)('"%s"', async (attrs) => {
    const r = await validateSwiftWithStubs(emit(attrs, 'swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe.runIf(isKotlincAvailable())('Kotlin — compiles', () => {
  it.each(FORMS)('"%s"', async (attrs) => {
    const r = await validateKotlin(emit(attrs, 'kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
