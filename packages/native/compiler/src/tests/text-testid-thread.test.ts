// Text + Heading data-testid threading — the device-found tag-drop
// class, third instance (fetch-arc, 2026-06-10).
//
// History of the class: Button dropped its testid (#1506,
// `app.buttons["login-submit"]` timed out); Field dropped it on Kotlin
// (a43599f01 — the tasks Espresso "Failed to perform text input");
// and Text/Heading dropped it on BOTH targets. The Android tasks
// device run caught Text first: the form error-path assert queried
// onNodeWithTag("login-error") and the tag was silently dropped —
// while the iOS smoke passed because it queries by LABEL, masking the
// identical Swift gap.
//
// Bisect sites: the emitSwiftLayoutModifiers append in emitSwiftText;
// the emitKotlinLayoutModifier threading in emitKotlinText /
// emitKotlinHeading; the emitSwiftTextCore split that keeps Heading
// from double-emitting the identifier.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
  export function App() {
    return (
      <Stack>
        <Text data-testid="t1">hello</Text>
        <Heading level={2} data-testid="h1">Title</Heading>
        <Text>untagged</Text>
      </Stack>
    )
  }
`

describe('Text/Heading data-testid threading — Swift', () => {
  it('Text carries .accessibilityIdentifier', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('Text("hello").accessibilityIdentifier("t1")')
  })

  it('Heading carries it ONCE (no double-emit through the Text core)', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const matches = out.match(/accessibilityIdentifier\("h1"\)/g) ?? []
    expect(matches.length).toBe(1)
    expect(out).toContain('.font(.title).bold().accessibilityIdentifier("h1")')
  })

  it('untagged Text stays bare', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('Text("untagged")\n')
  })
})

describe('Text/Heading data-testid threading — Kotlin', () => {
  it('Text carries Modifier.testTag', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('Text(text = "hello", modifier = Modifier.testTag("t1"))')
  })

  it('Heading carries it', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('modifier = Modifier.testTag("h1")')
  })

  it('untagged Text stays bare', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('Text(text = "untagged")')
  })

  it('interpolated Text (the login-error shape) carries the tag', () => {
    const out = transform(
      `
      export function App() {
        const form = useForm({ initialValues: { u: '' } })
        return <Stack><Text data-testid="login-error">{form.errors.u}</Text></Stack>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('modifier = Modifier.testTag("login-error")')
  })
})
