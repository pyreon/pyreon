// Template-literal lowering (subset widening).
//
// String interpolation (`` `Hello ${name}!` ``) is the single most common
// out-of-subset expression — labels, formatted values, accessibility strings.
// It previously WARN-DROPPED to the empty string `''` (blank labels on
// native, no signal). Now it lowers to NATIVE string interpolation:
//
//   Swift  → "Hello \(name)!"
//   Kotlin → "Hello ${name}!"
//
// Interpolation, NOT `+`-concat: Swift's `+` does not coerce a non-String
// interpoland (`"n=" + count` is a Swift type error), while interpolation
// coerces any type on both targets. A template child of <Text> splices its
// segments directly into the Text's own interpolation (no redundant
// `Text("\("…")")` double-wrap).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const name = signal('Ada')
  const count = signal(3)
  const label = 'Total'
${body}
}`

describe('template-literal lowering', () => {
  it('Swift: single interpolation → native string interpolation', () => {
    const out = transform(app('  return (<Stack><Text>{`Hello ${name()}!`}</Text></Stack>)'), {
      target: 'swift',
    }).code
    expect(out).toContain('Text("Hello \\(name)!")')
    // NOT the redundant double-wrap
    expect(out).not.toContain('Text("\\("Hello')
  })

  it('Kotlin: single interpolation → native string interpolation', () => {
    const out = transform(app('  return (<Stack><Text>{`Hello ${name()}!`}</Text></Stack>)'), {
      target: 'kotlin',
    }).code
    expect(out).toContain('Text(text = "Hello ${name}!")')
    expect(out).not.toContain('Text(text = "${"Hello')
  })

  it('multiple interpolations + a number interpoland (coercion-safe)', () => {
    const sw = transform(app('  return (<Stack><Text>{`${label}: ${count()} items`}</Text></Stack>)'), {
      target: 'swift',
    }).code
    const kt = transform(app('  return (<Stack><Text>{`${label}: ${count()} items`}</Text></Stack>)'), {
      target: 'kotlin',
    }).code
    expect(sw).toContain('Text("\\(label): \\(count) items")')
    expect(kt).toContain('Text(text = "${label}: ${count} items")')
  })

  it('a template with no interpolation emits a plain string', () => {
    const sw = transform(app('  return (<Stack><Text>{`just text`}</Text></Stack>)'), {
      target: 'swift',
    }).code
    expect(sw).toContain('Text("just text")')
  })

  it('escapes quotes + backslashes in quasi segments (both targets)', () => {
    const sw = transform(app('  return (<Stack><Text>{`a "q" and \\\\ z`}</Text></Stack>)'), {
      target: 'swift',
    }).code
    const kt = transform(app('  return (<Stack><Text>{`a "q" and \\\\ z`}</Text></Stack>)'), {
      target: 'kotlin',
    }).code
    expect(sw).toContain('Text("a \\"q\\" and \\\\ z")')
    expect(kt).toContain('Text(text = "a \\"q\\" and \\\\ z")')
  })

  it('a template assigned to a value-const emits a body-local let/val', () => {
    const sw = transform(
      app('  const greeting = `Hi ${name()}`\n  return (<Stack><Text>{greeting}</Text></Stack>)'),
      { target: 'swift' },
    ).code
    const kt = transform(
      app('  const greeting = `Hi ${name()}`\n  return (<Stack><Text>{greeting}</Text></Stack>)'),
      { target: 'kotlin' },
    ).code
    expect(sw).toContain('let greeting = "Hi \\(name)"')
    expect(kt).toContain('val greeting = "Hi ${name}"')
  })

  it('a template mixed with surrounding text in <Text> splices cleanly', () => {
    const sw = transform(
      app('  return (<Stack><Text>prefix {`mid ${count()}`} suffix</Text></Stack>)'),
      { target: 'swift' },
    ).code
    expect(sw).toContain('Text("prefix mid \\(count) suffix")')
  })

  it('a tagged template still warn-drops (no native equivalent)', () => {
    const res = transform(
      app('  return (<Stack><Text>{css`color: red`}</Text></Stack>)'),
      { target: 'swift' },
    )
    expect(res.warnings.some((w) => w.includes('tagged template'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: interpolated text typechecks via swiftc', () => {
    const out = transform(
      app('  return (<Stack><Text>{`${label}: ${count()} items`}</Text><Text>{`Hi ${name()}`}</Text></Stack>)'),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: interpolated text typechecks via kotlinc', () => {
    const out = transform(
      app('  return (<Stack><Text>{`${label}: ${count()} items`}</Text><Text>{`Hi ${name()}`}</Text></Stack>)'),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
