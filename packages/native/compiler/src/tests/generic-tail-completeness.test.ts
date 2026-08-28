/**
 * Every canonical primitive must carry the CROSS-CUTTING props — the ones the
 * generic modifier tail applies to any element: `accessibilityLabel`,
 * `accessibilityHidden`, and `data-testid`.
 *
 * A specialized emitter returns before that tail, so each one has to apply them
 * itself, and the failure mode is silent: the element renders, and the label
 * VoiceOver reads or the tag the device test selects on simply is not there.
 *
 * This has now been found FOUR separate times, each as a single-site fix:
 * `<Link>` losing its identifier on both targets (which is why it sat in the
 * capability matrix's "not individually asserted" list — you cannot assert on
 * an element you cannot select), `<Toggle>` losing its testTag on Kotlin, then
 * `<Link>` losing `accessibilityLabel` and `accessibilityHidden` on both, and
 * `<Modal>` losing all three on Kotlin. The Link emitter's own comment even
 * names the class before hand-adding one prop and stopping.
 *
 * So this asserts the MATRIX — every primitive × every cross-cutting prop ×
 * both targets, 90 cells — rather than the primitives someone remembered. A
 * primitive added tomorrow joins the list by being in the list; an emitter that
 * skips the tail fails here instead of on a device, months later, as an
 * accessibility bug nobody is looking for.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/** Required props per primitive, so nothing falls through to generic emit. */
const REQUIRED: Record<string, string> = {
  Stack: '',
  Inline: '',
  Layer: '',
  Scroll: '',
  Spacer: '',
  Text: '',
  Heading: '',
  Image: ' src="https://x.test/a.png" alt="a"',
  Icon: ' name="star"',
  Button: ' onPress={() => {}}',
  Press: ' onPress={() => {}}',
  Link: ' to="/x"',
  Field: ' value={v()} onChangeText={(n) => v.set(n)}',
  Toggle: ' value={b()} onChange={(n) => b.set(n)}',
  Modal: ' open onClose={() => {}}',
  // Three that the first version of this file left out — the hardcoded list of
  // 15 was itself the "gate input list is a silent-hole generator" shape, in
  // the very gate written to close that class. The drift check below is what
  // makes the list honest.
  Transition: ' show={b()}',
  Audio: ' src="https://x.test/a.mp3"',
  Video: ' src="https://x.test/a.mp4"',
}

const TAKES_CHILDREN = new Set([
  'Stack', 'Inline', 'Layer', 'Scroll', 'Button', 'Press', 'Link', 'Modal', 'Text', 'Heading',
  'Transition',
])

const CROSS_CUTTING = {
  accessibilityLabel: {
    attr: 'accessibilityLabel="LBL"',
    swift: /accessibilityLabel\("LBL"\)/,
    kotlin: /contentDescription = "LBL"/,
  },
  accessibilityHidden: {
    attr: 'accessibilityHidden={true}',
    swift: /accessibilityHidden\(true\)/,
    kotlin: /clearAndSetSemantics/,
  },
  'data-testid': {
    attr: 'data-testid="TID"',
    swift: /accessibilityIdentifier\("TID"\)/,
    kotlin: /testTag\("TID"\)/,
  },
} as const

const emit = (tag: string, attr: string, target: 'swift' | 'kotlin'): string => {
  const base = REQUIRED[tag] ?? ''
  const el = TAKES_CHILDREN.has(tag)
    ? `<${tag}${base} ${attr}>x</${tag}>`
    : `<${tag}${base} ${attr} />`
  const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Inline, Layer, Scroll, Spacer, Text, Heading, Image, Icon, Button, Press, Link, Field, Toggle, Modal, Transition, Audio, Video } from '@pyreon/primitives'
export function C() {
  const v = signal('')
  const b = signal(false)
  return <Stack>${el}</Stack>
}`
  return transform(src, { target }).code
}

describe('every canonical primitive carries the cross-cutting props', () => {
  const cells = Object.keys(REQUIRED).flatMap((tag) =>
    Object.entries(CROSS_CUTTING).flatMap(([prop, spec]) =>
      (['swift', 'kotlin'] as const).map((target) => ({ tag, prop, spec, target })),
    ),
  )

  it('covers every primitive that DECLARES the props, derived from the types', () => {
    // The matrix is the point, and a hardcoded list is exactly what lets a
    // primitive fall out of it. The first version of this file listed 15 and
    // the type files declare 18 — `<Transition>`, `<Audio>` and `<Video>` were
    // missing, and two of the three turned out to be dropping the whole tail.
    //
    // So the list is checked against its source of truth: every interface
    // extending `HtmlPassthroughProps` (which extends `AccessibilityProps`) is
    // a primitive that must appear here. A new one fails this assertion by
    // name rather than being silently uncovered.
    const typesDir = resolve(
      import.meta.dirname,
      '../../../../core/primitives/src/types',
    )
    const declared = new Set<string>()
    for (const file of readdirSync(typesDir)) {
      if (!file.endsWith('.ts')) continue
      const src = readFileSync(join(typesDir, file), 'utf8')
      for (const m of src.matchAll(/interface (\w+)Props\b[^{]*HtmlPassthroughProps/g)) {
        declared.add(m[1]!)
      }
    }
    expect(declared.size).toBeGreaterThan(0)
    const covered = new Set(Object.keys(REQUIRED))
    expect([...declared].filter((d) => !covered.has(d)).sort()).toEqual([])
    expect(cells).toHaveLength(covered.size * 3 * 2)
  })

  it.each(cells)('$tag carries $prop on $target', ({ tag, prop, spec, target }) => {
    const out = emit(tag, spec.attr, target)
    expect(out, `<${tag} ${spec.attr}> on ${target}:\n${out}`).toMatch(spec[target])
  })
})

describe('and pays nothing when they are absent', () => {
  it.each(Object.keys(REQUIRED))('%s without them emits no a11y machinery', (tag) => {
    // The wrapper `<Modal>` grew for its tag must not appear on a plain modal.
    const base = REQUIRED[tag] ?? ''
    const el = TAKES_CHILDREN.has(tag) ? `<${tag}${base}>x</${tag}>` : `<${tag}${base} />`
    const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Inline, Layer, Scroll, Spacer, Text, Heading, Image, Icon, Button, Press, Link, Field, Toggle, Modal, Transition, Audio, Video } from '@pyreon/primitives'
export function C() { const v = signal(''); const b = signal(false); return <Stack>${el}</Stack> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target }).code
      expect(out).not.toContain('accessibilityIdentifier')
      expect(out).not.toContain('testTag')
      expect(out).not.toContain('clearAndSetSemantics')
    }
  })
})
