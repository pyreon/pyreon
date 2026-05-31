/**
 * Tests for `useEditorSignal` hook — ensures automatic disposal
 * on component unmount.
 */
import { runWithHooks } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createEditor } from '../editor'
import { useEditorSignal } from '../use-editor-signal'

interface TestData {
  name: string
  value: number
}

const SERIALIZE = (val: TestData): string => JSON.stringify(val, null, 2)
const PARSE = (text: string): TestData | null => {
  try {
    return JSON.parse(text) as TestData
  } catch {
    return null
  }
}

describe('useEditorSignal', () => {
  it('exports the hook without throwing', () => {
    expect(typeof useEditorSignal).toBe('function')
  })

  it('hook propagates external→editor changes', async () => {
    const data = signal<TestData>({ name: 'Alice', value: 1 })
    const editor = createEditor({
      value: SERIALIZE(data()),
    })

    // Use bindEditorToSignal directly since useEditorSignal requires lifecycle context
    // This test verifies the hook would work when called in a component
    const { bindEditorToSignal } = await import('../bind-signal')
    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    // Change external value
    data.set({ name: 'Bob', value: 2 })

    // Allow effects to run
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Editor should reflect the change
    const editorValue = JSON.parse(editor.value())
    expect(editorValue.name).toBe('Bob')
    expect(editorValue.value).toBe(2)

    binding.dispose()
  })

  it('hook propagates editor→external changes', async () => {
    const data = signal<TestData>({ name: 'Alice', value: 1 })
    const editor = createEditor({
      value: SERIALIZE(data()),
    })

    // Use bindEditorToSignal directly since useEditorSignal requires lifecycle context
    const { bindEditorToSignal } = await import('../bind-signal')
    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
    })

    // Change editor value
    editor.value.set(SERIALIZE({ name: 'Bob', value: 3 }))

    // Allow effects to run
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Signal should reflect the change
    const signalValue = data()
    expect(signalValue.name).toBe('Bob')
    expect(signalValue.value).toBe(3)

    binding.dispose()
  })

  it('hook invoked inside lifecycle context auto-disposes on unmount', async () => {
    const data = signal<TestData>({ name: 'Alice', value: 1 })
    const editor = createEditor({ value: SERIALIZE(data()) })

    // runWithHooks gives useEditorSignal the lifecycle context it needs;
    // onUnmount registrations land on hooks.unmount. This is the path that
    // exercises useEditorSignal directly (the other tests use
    // bindEditorToSignal as a stand-in).
    const { hooks } = runWithHooks(() => {
      useEditorSignal({
        editor,
        signal: data,
        serialize: SERIALIZE,
        parse: PARSE,
      })
      return null
    }, {})

    // Binding is live — external write propagates.
    data.set({ name: 'Bob', value: 2 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(JSON.parse(editor.value()).name).toBe('Bob')

    // Fire unmount → useEditorSignal's registered cleanup disposes the binding.
    expect(hooks.unmount?.length).toBeGreaterThan(0)
    hooks.unmount?.forEach((fn) => fn())

    // Post-dispose: external writes no longer reach the editor.
    data.set({ name: 'Carol', value: 3 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(JSON.parse(editor.value()).name).toBe('Bob') // unchanged
  })

  it('hook handles parse errors without crashing', async () => {
    const data = signal<TestData>({ name: 'Alice', value: 1 })
    const editor = createEditor({
      value: SERIALIZE(data()),
    })

    const parseErrors: unknown[] = []

    // Use bindEditorToSignal directly since useEditorSignal requires lifecycle context
    const { bindEditorToSignal } = await import('../bind-signal')
    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: SERIALIZE,
      parse: PARSE,
      onParseError: (err) => {
        parseErrors.push(err)
      },
    })

    // Set invalid JSON in editor
    editor.value.set('{ invalid json')

    // Allow effects to run (multiple ticks to ensure all effects process)
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Error should be captured (or at least the signal remains at last valid value)
    // The hook itself doesn't change this behavior — it just adds auto-dispose
    expect(data()).toEqual({ name: 'Alice', value: 1 })

    binding.dispose()
  })
})
