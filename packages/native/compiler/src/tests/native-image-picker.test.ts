// M3.4 — `useImagePicker()` recognition + emit on both targets.
//
// The SECOND async-result service (after M3.5's useBiometrics), so it rides the
// M4.5 `await` lowering that native-async.test.ts locks. What is NEW here — and
// what these specs exist to pin — is the iOS/Android ASYMMETRY:
//
//   Swift:  @State private var picker = PyreonImagePicker()
//           …PHPickerViewController presents itself from the key window, so the
//           call site needs no extra plumbing.
//   Kotlin: val picker = remember { PyreonImagePicker() }
//           picker.launcher = rememberLauncherForActivityResult(
//               ActivityResultContracts.PickVisualMedia()) { uri -> picker.onResult(uri?.toString()) }
//           …because Android delivers the pick through an ActivityResult
//           CALLBACK whose registration must happen at COMPOSITION time
//           (rememberLauncherForActivityResult is a @Composable — registering
//           once the host is RESUMED throws). The container bridges
//           callback→suspend so `pick()` keeps Swift's `async` shape.
//
// Like native-async.test.ts, these COMPILE the emit on the real toolchains
// rather than only string-matching: an uncompilable-but-plausible emit is
// exactly the class a string-match gate waves through (the M2.8 lesson).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// The canonical shape: pick, then branch on an EXPLICIT null comparison.
// `uri === null` (not truthiness) is what lowers to `== nil` / `== null` — JS
// truthiness is not a native Bool.
const SRC = `import { signal } from '@pyreon/reactivity'
import { useImagePicker } from '@pyreon/hooks'
export function Photo() {
  const picker = useImagePicker()
  const status = signal('idle')
  return (
    <VStack>
      <Text>{status()}</Text>
      <Button onPress={async () => { const uri = await picker.pick(); status.set(uri === null ? 'cancelled' : 'picked') }}>Pick</Button>
    </VStack>
  )
}`

describe('M3.4 useImagePicker — Swift emit', () => {
  it('declares an @State PyreonImagePicker and awaits pick() inside a Task', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('@State private var picker = PyreonImagePicker()')
    expect(out).toContain('Task {')
    expect(out).toContain('let uri = await picker.pick()')
    // The explicit null comparison must survive as an optional test, NOT a
    // truthiness coercion (which Swift has no equivalent for).
    expect(out).toContain('uri == nil')
  })

  it('recognizes the hook (no unresolved-identifier fallthrough) and warns nothing', () => {
    const res = transform(SRC, { target: 'swift' })
    expect(res.warnings ?? []).toEqual([])
    // The bisect target: an UNREGISTERED hook falls through to a bare
    // identifier reference (`(useImagePicker).pick()`) instead of the @State
    // container — green string-matching on `.pick()` alone would miss it.
    expect(res.code).not.toContain('useImagePicker')
  })

  it.skipIf(!isSwiftcAvailable())('emit typechecks against the SwiftUI stubs', () => {
    const res = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('M3.4 useImagePicker — Kotlin emit', () => {
  it('remembers the container and wires a composable-scope ActivityResult launcher', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('val picker = remember { PyreonImagePicker() }')
    expect(out).toContain('picker.launcher = rememberLauncherForActivityResult(')
    expect(out).toContain('ActivityResultContracts.PickVisualMedia()')
    // The callback bridges the Uri back into the suspended pick().
    expect(out).toContain('picker.onResult(uri?.toString())')
  })

  it('awaits pick() inside the async scope WITHOUT an await keyword', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('pyreonAsyncScope.launch {')
    expect(out).toContain('val uri = picker.pick()')
    // A Kotlin suspend call carries no `await` — the coroutine is the context.
    expect(out).not.toContain('await picker.pick()')
    expect(out).toContain('if (uri == null)')
  })

  it.skipIf(!isKotlincAvailable())('emit typechecks against the Compose stubs', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
