// M3.8 — `useFilePicker()` recognition + emit on both targets. The document
// sibling of native-image-picker.test.ts (any file, not just photos), and the
// THIRD async-result service, so it rides the M4.5 `await` lowering.
//
// What is NEW vs the image picker — and what these specs pin — is the SAF
// contract on Android: `OpenDocument` (input `Array<String>` of MIME types) in
// place of `PickVisualMedia`. iOS is a straight parallel
// (UIDocumentPickerViewController presents from the key window, so the emit is
// just an @State container).
//
// Like native-image-picker.test.ts, these COMPILE the emit on the real
// toolchains rather than only string-matching: an uncompilable-but-plausible
// emit is exactly the class a string-match gate waves through (the M2.8 lesson).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

// The canonical shape: pick, then branch on an EXPLICIT null comparison.
// `uri === null` (not truthiness) is what lowers to `== nil` / `== null`.
const SRC = `import { signal } from '@pyreon/reactivity'
import { useFilePicker } from '@pyreon/hooks'
export function Files() {
  const files = useFilePicker()
  const status = signal('idle')
  return (
    <VStack>
      <Text>{status()}</Text>
      <Button onPress={async () => { const uri = await files.pick(); status.set(uri === null ? 'cancelled' : 'picked') }}>Pick</Button>
    </VStack>
  )
}`

describe('M3.8 useFilePicker — Swift emit', () => {
  it('declares an @State PyreonFilePicker and awaits pick() inside a Task', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('@State private var files = PyreonFilePicker()')
    expect(out).toContain('Task {')
    expect(out).toContain('let uri = await files.pick()')
    // The explicit null comparison must survive as an optional test, NOT a
    // truthiness coercion (which Swift has no equivalent for).
    expect(out).toContain('uri == nil')
  })

  it('recognizes the hook (no unresolved-identifier fallthrough) and warns nothing', () => {
    const res = transform(SRC, { target: 'swift' })
    expect(res.warnings ?? []).toEqual([])
    // The bisect target: an UNREGISTERED hook falls through to a bare
    // identifier reference instead of the @State container.
    expect(res.code).not.toContain('useFilePicker')
  })

  it.skipIf(!isSwiftcAvailable())('emit typechecks against the SwiftUI stubs', () => {
    const res = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('M3.8 useFilePicker — Kotlin emit', () => {
  it('remembers the container and wires an OpenDocument ActivityResult launcher', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('val files = remember { PyreonFilePicker() }')
    expect(out).toContain('files.launcher = rememberLauncherForActivityResult(')
    // The SAF document contract — NOT PickVisualMedia (that's the image picker).
    expect(out).toContain('ActivityResultContracts.OpenDocument()')
    expect(out).not.toContain('PickVisualMedia')
    // The callback bridges the Uri back into the suspended pick().
    expect(out).toContain('files.onResult(uri?.toString())')
  })

  it('awaits pick() inside the async scope WITHOUT an await keyword', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('pyreonAsyncScope.launch {')
    expect(out).toContain('val uri = files.pick()')
    // A Kotlin suspend call carries no `await` — the coroutine is the context.
    expect(out).not.toContain('await files.pick()')
    expect(out).toContain('if (uri == null)')
  })

  it.skipIf(!isKotlincAvailable())('emit typechecks against the Compose stubs', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

// `pick(accept)` — the web `<input accept>` vocabulary, passed per pick. The array
// lowers like any other: a literal to `["…"]` / `listOf("…")`, a const by name.
// Both runtimes take it with a default, so the bare `pick()` above is unchanged.
const ACCEPT_SRC = `import { signal } from '@pyreon/reactivity'
import { useFilePicker } from '@pyreon/hooks'
export function Files() {
  const files = useFilePicker()
  const status = signal('idle')
  const images = ['image/*']
  return (
    <VStack>
      <Text>{status()}</Text>
      <Button onPress={async () => { const uri = await files.pick(['application/pdf', '.csv']); status.set(uri === null ? 'c' : 'p') }}>Docs</Button>
      <Button onPress={async () => { const uri = await files.pick(images); status.set(uri === null ? 'c' : 'p') }}>Images</Button>
    </VStack>
  )
}`

describe('useFilePicker — pick(accept)', () => {
  it('passes the accept list through on both targets, with no warning', () => {
    const swift = transform(ACCEPT_SRC, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('await files.pick(["application/pdf", ".csv"])')
    const kotlin = transform(ACCEPT_SRC, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('files.pick(listOf("application/pdf", ".csv"))')
    expect(kotlin.code).toContain('files.pick(images)')
  })

  it.skipIf(!isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(transform(ACCEPT_SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const v = validateKotlin(transform(ACCEPT_SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
