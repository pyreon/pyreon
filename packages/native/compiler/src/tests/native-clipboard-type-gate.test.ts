// `useClipboard()` had NO type-gate coverage on either target.
//
// The emit was fine — `PyreonClipboard()` on Swift, and on Kotlin the
// Context + CoroutineScope hoist-and-inject shape. But neither
// `swift-stubs.ts` nor `kotlin-stubs.ts` declared `PyreonClipboard`, so the
// per-fixture type gate could not compile a clipboard app at all: every
// attempt died on `cannot find 'PyreonClipboard' in scope` before it could
// say anything about the emit.
//
// That is the same blind spot that hid `useDatabase`'s missing Swift argument
// labels for months (#2514) — a capability whose emit is never type-checked is
// a capability whose emit is unverified, however clean the string looks. The
// gate's coverage is only as wide as its stub table, and nothing was tracking
// which hooks were outside it.
//
// Both stubs mirror the REAL surface exactly rather than being convenient:
// `copy` takes no argument label on Swift, `copied` is read-only on both, and
// the Kotlin constructor takes (Context, CoroutineScope). A superset stub is
// itself a masking source — the rule kotlin-stubs.ts already states four times
// over, and the reason the database's required-backend constructor is mirrored
// rather than defaulted.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const SRC = `import { useClipboard } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function Share() {
  const clip = useClipboard()
  return (
    <Stack>
      <Text>Clip: {clip.copied}</Text>
      <Button onPress={() => clip.copy('pyreon-clip-probe')}>Copy Text</Button>
    </Stack>
  )
}`

const swift = () => transform(SRC, { target: 'swift' }).code
const kotlin = () => transform(SRC, { target: 'kotlin' }).code

describe('useClipboard type gate', () => {
  it('Swift emits a plain PyreonClipboard — iOS needs no context', () => {
    expect(swift()).toContain('@State private var clip = PyreonClipboard()')
    expect(swift()).toContain(`clip.copy("pyreon-clip-probe")`)
  })

  it('Kotlin hoists BOTH a Context and a CoroutineScope into the constructor', () => {
    // Android needs a Context for ClipboardManager, and a scope for the
    // ~2s `copied` reset. Both are composable-scope reads, so they cannot
    // appear inside `remember { … }` — they are hoisted to siblings.
    const out = kotlin()
    expect(out).toContain('val clipCtx = LocalContext.current')
    expect(out).toContain('val clipScope = rememberCoroutineScope()')
    expect(out).toContain('val clip = remember { PyreonClipboard(clipCtx, clipScope) }')
  })

  it('emits no warnings', () => {
    expect(transform(SRC, { target: 'swift' }).warnings ?? []).toEqual([])
    expect(transform(SRC, { target: 'kotlin' }).warnings ?? []).toEqual([])
  })

  // THE POINT OF THIS FILE. Before the stubs existed both of these failed with
  // `cannot find 'PyreonClipboard' in scope` / `unresolved reference`, which is
  // indistinguishable from "the gate has no opinion" — and was.
  it.skipIf(!isSwiftcAvailable())('the emitted Swift type-checks against the stubs', () => {
    const res = validateSwiftWithStubs(swift())
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin type-checks against the stubs', () => {
    const res = validateKotlin(kotlin())
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // The stubs must REJECT what the real runtime rejects, or they are decoration.
  // `copied` is read-only on both platforms (`private(set)` / a getter-only
  // `val`), so an emit that assigned to it must not sail through.
  it.skipIf(!isSwiftcAvailable())('Swift stub REJECTS a write to the read-only `copied`', () => {
    const bad = swift().replace('clip.copy("pyreon-clip-probe")', 'clip.copied = true')
    expect(validateSwiftWithStubs(bad).ok).toBe(false)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin stub REJECTS a write to the read-only `copied`', () => {
    const bad = kotlin().replace('clip.copy("pyreon-clip-probe")', 'clip.copied = true')
    expect(validateKotlin(bad).ok).toBe(false)
  })
})
