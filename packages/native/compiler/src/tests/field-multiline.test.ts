// `<Field multiline lines>` — a text area on every target (#3980).
//
// The web contract (`@pyreon/primitives` web/Field.tsx) is the oracle: a
// `<textarea rows={lines}>` that is exactly `lines` rows tall, scrolls past
// them, inserts a newline on Return and has no keyboard `kind`. The two native
// lowerings must agree with it AND with each other, which is why the decision
// lives in one shared helper (`field-shape.ts`) and why this file asserts both
// targets side by side.

import { describe, expect, it } from 'vitest'
import { FIELD_DEFAULT_LINES as WEB_DEFAULT_LINES } from '../../../../core/primitives/src/web/Field'
import { FIELD_DEFAULT_LINES } from '../field-shape'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const app = (jsx: string) => `
  import { signal } from '@pyreon/reactivity'
  import { Stack, Field } from '@pyreon/primitives'
  export function Notes() {
    const notes = signal('')
    const rows = signal(4)
    return (<Stack>${jsx}</Stack>)
  }
`
const both = (jsx: string) => ({
  swift: transform(app(jsx), { target: 'swift' }),
  kotlin: transform(app(jsx), { target: 'kotlin' }),
})

describe('<Field multiline> — emit', () => {
  it('the default row count is the web default — one number, three targets', () => {
    expect(FIELD_DEFAULT_LINES).toBe(WEB_DEFAULT_LINES)
  })

  it('a bare `multiline` is a fixed-height, default-row text area on both targets', () => {
    const { swift, kotlin } = both(
      `<Field multiline value={notes} onChangeText={(v) => notes.set(v)} placeholder="Notes" />`,
    )
    expect(swift.code).toContain('TextField("Notes", text: $notes, axis: .vertical)')
    expect(swift.code).toContain(`.lineLimit(${FIELD_DEFAULT_LINES}, reservesSpace: true)`)
    expect(kotlin.code).toContain(
      `singleLine = false, minLines = ${FIELD_DEFAULT_LINES}, maxLines = ${FIELD_DEFAULT_LINES}`,
    )
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('a static `lines` sets the visible rows', () => {
    const { swift, kotlin } = both(
      `<Field multiline lines={6} value={notes} onChangeText={(v) => notes.set(v)} />`,
    )
    expect(swift.code).toContain('.lineLimit(6, reservesSpace: true)')
    expect(kotlin.code).toContain('minLines = 6, maxLines = 6')
  })

  it('a dynamic `lines` stays live and is clamped to at least one row, as on the web', () => {
    const { swift, kotlin } = both(
      `<Field multiline lines={rows()} value={notes} onChangeText={(v) => notes.set(v)} />`,
    )
    expect(swift.code).toContain('.lineLimit(max(1, Int(rows)), reservesSpace: true)')
    expect(kotlin.code).toContain(
      'minLines = maxOf(1, (rows).toInt()), maxLines = maxOf(1, (rows).toInt())',
    )
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('the controlled shape lowers too, not only the bare signal', () => {
    const { swift, kotlin } = both(
      `<Field multiline value={notes()} onChangeText={(v) => notes.set(v)} />`,
    )
    expect(swift.code).toMatch(/TextField\("", text: Binding\([\s\S]*\), axis: \.vertical\)/)
    expect(kotlin.code).toContain(
      'TextField(value = notes, onValueChange = { v -> notes = v }, singleLine = false',
    )
  })

  it('a single-line Field says singleLine on Android — Material defaults to multi-line', () => {
    // Material's TextField has singleLine = false by default, so before this the
    // ordinary <Field> wrapped and took newlines on Android only.
    const { kotlin } = both(`<Field value={notes} onChangeText={(v) => notes.set(v)} />`)
    expect(kotlin.code).toContain('singleLine = true')
    expect(kotlin.code).not.toContain('minLines')
  })

  it('`multiline={false}` is the single-line field, with no warning', () => {
    const { swift, kotlin } = both(
      `<Field multiline={false} value={notes} onChangeText={(v) => notes.set(v)} />`,
    )
    expect(swift.code).not.toContain('axis: .vertical')
    expect(kotlin.code).toContain('singleLine = true')
    expect(swift.warnings).toEqual([])
  })
})

describe('<Field multiline> — every shape that cannot lower is NAMED', () => {
  const warnsOnBoth = (jsx: string, needle: RegExp) => {
    const { swift, kotlin } = both(jsx)
    expect(
      swift.warnings.some((w) => needle.test(w)),
      swift.warnings.join('\n'),
    ).toBe(true)
    expect(
      kotlin.warnings.some((w) => needle.test(w)),
      kotlin.warnings.join('\n'),
    ).toBe(true)
    return { swift, kotlin }
  }

  it('a dynamic `multiline` (structural) warns and stays single-line', () => {
    const { swift, kotlin } = warnsOnBoth(
      `<Field multiline={rows() > 2} value={notes} onChangeText={(v) => notes.set(v)} />`,
      /<Field multiline> was given a non-static value/,
    )
    expect(swift.code).not.toContain('axis: .vertical')
    expect(kotlin.code).toContain('singleLine = true')
  })

  it('`lines` without `multiline` warns, and is ignored as the web ignores it', () => {
    const { swift } = warnsOnBoth(
      `<Field lines={4} value={notes} onChangeText={(v) => notes.set(v)} />`,
      /<Field lines> only applies to a `multiline` field/,
    )
    expect(swift.code).not.toContain('lineLimit')
  })

  it('an invalid static `lines` warns and uses the default', () => {
    const { swift, kotlin } = warnsOnBoth(
      `<Field multiline lines={0} value={notes} onChangeText={(v) => notes.set(v)} />`,
      /must be a whole number of rows/,
    )
    expect(swift.code).toContain(`.lineLimit(${FIELD_DEFAULT_LINES}, reservesSpace: true)`)
    expect(kotlin.code).toContain(`minLines = ${FIELD_DEFAULT_LINES}`)
  })

  it('`onSubmit` on a text area warns and is not wired (Return inserts a newline)', () => {
    const { swift, kotlin } = warnsOnBoth(
      `<Field multiline value={notes} onChangeText={(v) => notes.set(v)} onSubmit={() => notes.set('')} />`,
      /<Field multiline onSubmit>/,
    )
    expect(swift.code).not.toContain('.onSubmit')
    expect(kotlin.code).not.toContain('keyboardActions')
    expect(kotlin.code).not.toContain('ImeAction.Done')
  })

  it('a keyboard `kind` on a text area warns and is not applied — including password', () => {
    const email = warnsOnBoth(
      `<Field multiline kind="email" value={notes} onChangeText={(v) => notes.set(v)} />`,
      /<Field multiline kind>/,
    )
    expect(email.swift.code).not.toContain('.keyboardType')
    expect(email.kotlin.code).not.toContain('KeyboardType.Email')
    const pw = warnsOnBoth(
      `<Field multiline kind="password" value={notes} onChangeText={(v) => notes.set(v)} />`,
      /<Field multiline kind>/,
    )
    expect(pw.swift.code).not.toContain('SecureField')
    expect(pw.kotlin.code).not.toContain('PasswordVisualTransformation')
  })

  it('kind="text" is the text area\'s own kind — no warning', () => {
    const { swift, kotlin } = both(
      `<Field multiline kind="text" value={notes} onChangeText={(v) => notes.set(v)} />`,
    )
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })
})

describe('<Field multiline> — the emit compiles', () => {
  const jsx = [
    `<Field multiline value={notes} onChangeText={(v) => notes.set(v)} placeholder="Notes" data-testid="n" />`,
    `<Field multiline lines={rows()} value={notes()} onChangeText={(v) => notes.set(v)} disabled />`,
    `<Field value={notes} onChangeText={(v) => notes.set(v)} kind="email" onSubmit={() => notes.set('')} />`,
  ].join('\n')

  it.skipIf(!isSwiftcAvailable())('Swift type-checks', () => {
    const res = validateSwiftWithStubs(transform(app(jsx), { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())(
    'Kotlin type-checks',
    () => {
      const res = validateKotlin(transform(app(jsx), { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    },
    180_000,
  )
})
