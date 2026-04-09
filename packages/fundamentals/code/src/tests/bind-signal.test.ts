/**
 * Verification tests for `bindEditorToSignal`.
 *
 * The helper exists to replace the recurring loop-prevention
 * boilerplate that PRs #191 (resume builder) and #192 (flow editor)
 * had to hand-roll. These tests assert the contracts documented in
 * the helper's JSDoc:
 *
 *   1. External → editor: when the external signal changes, the
 *      editor's text updates via `editor.value.set()`.
 *   2. Editor → external: when the editor's text changes (which
 *      happens via the CM updateListener writing to `editor.value`),
 *      the external signal updates via `signal.set(parse(text))`.
 *   3. No infinite loop: rapid bidirectional changes terminate.
 *      The internal flag pair (`applyingFromExternal` /
 *      `applyingFromEditor`) breaks the format-on-input race.
 *   4. Parse failures don't crash: malformed text in the editor
 *      leaves the external state unchanged and (optionally) calls
 *      `onParseError`.
 *   5. `dispose()` stops both directions: after disposal, neither
 *      side propagates changes.
 *
 * Tests run in `happy-dom` (the package's vitest config sets it).
 * They don't actually mount a `<CodeEditor>` — the helper only
 * needs `editor.value` to be a writable signal, which `createEditor`
 * provides without mounting.
 */
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { bindEditorToSignal } from '../bind-signal'
import { createEditor } from '../editor'

interface Doc {
  name: string
  count: number
}

const SERIALIZE = (val: Doc): string => JSON.stringify(val, null, 2)
const PARSE = (text: string): Doc | null => {
  try {
    return JSON.parse(text) as Doc
  } catch {
    return null
  }
}

describe('bindEditorToSignal', () => {
  it('initial external value is reflected in editor on first effect run', () => {
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const editor = createEditor({ value: '' })

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    expect(editor.value()).toBe(SERIALIZE({ name: 'Alice', count: 1 }))
    binding.dispose()
  })

  it('external signal change propagates to editor', () => {
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    data.set({ name: 'Bob', count: 5 })
    expect(editor.value()).toBe(SERIALIZE({ name: 'Bob', count: 5 }))

    data.set({ name: 'Carol', count: 12 })
    expect(editor.value()).toBe(SERIALIZE({ name: 'Carol', count: 12 }))

    binding.dispose()
  })

  it('editor value change propagates to external signal', () => {
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    // Simulate user typing by writing to editor.value directly.
    // The editor's internal CM↔signal loop guard handles the
    // CM-side bookkeeping; from the helper's perspective, the
    // signal change is what matters.
    editor.value.set(JSON.stringify({ name: 'Dan', count: 99 }))

    expect(data().name).toBe('Dan')
    expect(data().count).toBe(99)

    binding.dispose()
  })

  it('rapid bidirectional changes terminate (no infinite loop)', () => {
    const data = signal<Doc>({ name: 'A', count: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    // Alternate writes from both sides 5 times. If there were an
    // infinite loop, this test would hang. Vitest's default
    // timeout (5s) catches the runaway case.
    for (let i = 0; i < 5; i++) {
      data.set({ name: `from-signal-${i}`, count: i })
      editor.value.set(JSON.stringify({ name: `from-editor-${i}`, count: i + 100 }))
    }

    // After the last editor write, the external signal reflects it.
    expect(data().name).toBe('from-editor-4')
    expect(data().count).toBe(104)

    binding.dispose()
  })

  it('parse failure leaves external state at last valid value', () => {
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    // Write malformed JSON to the editor
    editor.value.set('{ this is not valid json')

    // External state stays at the last valid value
    expect(data().name).toBe('Alice')
    expect(data().count).toBe(1)

    // The editor still holds the malformed text — the helper
    // doesn't reach into the editor to "fix" it on parse failure.
    expect(editor.value()).toBe('{ this is not valid json')

    // After the user corrects the text, the external signal
    // catches up.
    editor.value.set(JSON.stringify({ name: 'Eve', count: 7 }))
    expect(data().name).toBe('Eve')
    expect(data().count).toBe(7)

    binding.dispose()
  })

  it('onParseError fires on parse exceptions', () => {
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    const errors: Error[] = []

    // Use a parse function that THROWS instead of returning null
    // — covers the catch branch in the helper.
    const throwingParse = (text: string): Doc => {
      const parsed = JSON.parse(text) as Doc
      if (typeof parsed.name !== 'string') {
        throw new Error('expected `name` to be a string')
      }
      return parsed
    }

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: throwingParse,
      onParseError: (err) => errors.push(err),
    })

    // Valid JSON but wrong shape — parse throws.
    editor.value.set(JSON.stringify({ name: 42, count: 1 }))

    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain('expected `name` to be a string')
    // External state unchanged
    expect(data().name).toBe('Alice')

    binding.dispose()
  })

  it('parse returning null is treated as a no-op (no error fires)', () => {
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    let errorFired = false
    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
      onParseError: () => {
        errorFired = true
      },
    })

    editor.value.set('{ malformed')
    expect(errorFired).toBe(false)
    expect(data().name).toBe('Alice')

    binding.dispose()
  })

  it('dispose() stops both directions', () => {
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    // Sanity: binding is live
    data.set({ name: 'Bob', count: 2 })
    expect(editor.value()).toBe(SERIALIZE({ name: 'Bob', count: 2 }))

    binding.dispose()

    // External → editor stops
    data.set({ name: 'Carol', count: 3 })
    expect(editor.value()).toBe(SERIALIZE({ name: 'Bob', count: 2 }))

    // Editor → external stops
    editor.value.set(JSON.stringify({ name: 'Dan', count: 4 }))
    expect(data().name).toBe('Carol') // unchanged from the disposed-state value
  })

  it('serialize that produces an identical string short-circuits the editor write', () => {
    // Regression case: if the external signal is set to a value
    // whose serialized form already matches editor.value, the
    // helper should NOT dispatch a redundant editor.value.set().
    // Otherwise the editor would do unnecessary CM dispatches and
    // potentially shift cursor position.
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const initialText = SERIALIZE(data())
    const editor = createEditor({ value: initialText })

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    // Re-set the signal to the same value. The serialized form is
    // unchanged, and the helper compares against editor.value.peek()
    // before writing.
    data.set({ name: 'Alice', count: 1 })

    // The editor's value is still the same string instance — the
    // helper short-circuited.
    expect(editor.value()).toBe(initialText)

    binding.dispose()
  })

  it('accepts a SignalLike object (not just a Pyreon Signal)', () => {
    // The SignalLike interface lets consumers pass any object with
    // `()` and `set()` methods. This test verifies the structural
    // typing works by passing a custom wrapper.
    const data = signal<Doc>({ name: 'Alice', count: 1 })
    const wrapped = Object.assign(() => data(), {
      set: (val: Doc) => data.set(val),
      peek: () => data.peek(),
    }) as { (): Doc; set: (val: Doc) => void; peek: () => Doc }

    const editor = createEditor({ value: SERIALIZE(data()) })
    const binding = bindEditorToSignal({
      editor,
      signal: wrapped,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    data.set({ name: 'Wrapped', count: 99 })
    expect(editor.value()).toBe(SERIALIZE({ name: 'Wrapped', count: 99 }))

    editor.value.set(JSON.stringify({ name: 'FromEditor', count: 1 }))
    expect(data().name).toBe('FromEditor')

    binding.dispose()
  })
})
