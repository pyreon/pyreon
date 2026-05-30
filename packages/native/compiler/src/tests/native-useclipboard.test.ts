// Phase 4 — `useClipboard()` native emit. Own test file (same convention
// as native-usepermissions / native-useonline — keeps Phase-4 service
// tests in self-contained files instead of one append-conflict-prone
// monster file).
//
// `const cb = useClipboard()` from @pyreon/hooks → a PyreonClipboard
// reactive wrapper. Swift emits `@State private var cb = PyreonClipboard()`;
// Kotlin a `remember { PyreonClipboard(ctx) }` with the LocalContext hoisted
// into a sibling `val cbCtx = LocalContext.current` (Compose's
// remember-lambda is non-Composable so the Local read must be lifted out).
//
// Reads are method calls (`cb.copy("hi")`) + a Boolean field
// (`cb.copied`) — unlike useFetch / useForm there is NO `.value`
// field-read rewrite, since `copied` is a plain Bool property on the
// @Observable container (Swift) / MutableState-backed property (Kotlin).
//
// V1 supports the single-binding shape only — the destructure form
// `const { copy, copied } = useClipboard()` is a documented follow-up
// (would need the per-key rewrite logic the `params-destructure` IR uses).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Phase 4 — useClipboard() native emit', () => {
  it('Swift: @State PyreonClipboard, method calls + plain Bool field read', () => {
    const out = transform(
      `
      export function Copy() {
        const cb = useClipboard()
        return (
          <Stack>
            <Button onPress={() => cb.copy('hi')}>Copy</Button>
            <Text>{cb.copied ? 'Copied!' : ''}</Text>
          </Stack>
        )
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var cb = PyreonClipboard()')
    expect(out).toContain('cb.copy("hi")')
    // Plain field read — no `.value` rewrite.
    expect(out).toContain('cb.copied')
    expect(out).not.toContain('cb.copied.value')
  })

  it('Kotlin: hoisted LocalContext + remember { PyreonClipboard(ctx) }, method calls + plain Boolean read', () => {
    const out = transform(
      `
      export function Copy() {
        const cb = useClipboard()
        return (
          <Stack>
            <Button onPress={() => cb.copy('hi')}>Copy</Button>
            <Text>{cb.copied ? 'Copied!' : ''}</Text>
          </Stack>
        )
      }
      `,
      { target: 'kotlin' },
    ).code
    // Two-line emit: hoisted Context + remembered container.
    expect(out).toContain('val cbCtx = LocalContext.current')
    expect(out).toContain('val cb = remember { PyreonClipboard(cbCtx) }')
    // Method call passes only the text — context is captured at construction.
    expect(out).toContain('cb.copy("hi")')
    expect(out).not.toContain('cb.copy(LocalContext.current')
    expect(out).not.toContain('cb.copy(cbCtx')
    // Plain field read — no `.value` rewrite.
    expect(out).toContain('cb.copied')
    expect(out).not.toContain('cb.copied.value')
  })

  it('emits one PyreonClipboard per binding (distinct local names)', () => {
    const swift = transform(
      `
      export function TwoCopies() {
        const a = useClipboard()
        const b = useClipboard()
        return <Stack><Button onPress={() => a.copy('1')}>1</Button><Button onPress={() => b.copy('2')}>2</Button></Stack>
      }
      `,
      { target: 'swift' },
    ).code
    expect(swift).toContain('@State private var a = PyreonClipboard()')
    expect(swift).toContain('@State private var b = PyreonClipboard()')

    const kotlin = transform(
      `
      export function TwoCopies() {
        const a = useClipboard()
        const b = useClipboard()
        return <Stack><Button onPress={() => a.copy('1')}>1</Button><Button onPress={() => b.copy('2')}>2</Button></Stack>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(kotlin).toContain('val aCtx = LocalContext.current')
    expect(kotlin).toContain('val a = remember { PyreonClipboard(aCtx) }')
    expect(kotlin).toContain('val bCtx = LocalContext.current')
    expect(kotlin).toContain('val b = remember { PyreonClipboard(bCtx) }')
  })
})
