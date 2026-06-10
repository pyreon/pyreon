import { describe, expect, it } from 'vitest'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { syncedText } from '../crdt/yjs-text'
import { connectYDocs } from '../crdt/yjs-transport'

describe('syncedText — collaborative Y.Text', () => {
  it('starts empty and reads the text', () => {
    const t = syncedText(createYjsDoc(), 'body')
    expect(t()).toBe('')
  })

  it('insert / delete update the signal', () => {
    const t = syncedText(createYjsDoc(), 'body')
    t.insert(0, 'hello')
    expect(t()).toBe('hello')
    t.insert(5, ' world')
    expect(t()).toBe('hello world')
    t.delete(0, 6)
    expect(t()).toBe('world')
  })

  it('.set applies a minimal prefix/suffix-preserving diff', () => {
    const t = syncedText(createYjsDoc(), 'body')
    t.set('the quick brown fox')
    expect(t()).toBe('the quick brown fox')
    t.set('the slow brown fox') // middle replace
    expect(t()).toBe('the slow brown fox')
    t.set('the slow brown fox!') // suffix insert
    expect(t()).toBe('the slow brown fox!')
    t.set('') // full delete
    expect(t()).toBe('')
  })

  it('notifies subscribers exactly once per edit', () => {
    const t = syncedText(createYjsDoc(), 'body')
    let fires = 0
    t.subscribe(() => fires++)
    t.insert(0, 'x')
    expect(fires).toBe(1)
    expect(t()).toBe('x')
  })

  it('CONCURRENT inserts from two peers MERGE with no lost text (character CRDT, unlike scalar LWW)', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    connectYDocs(a, b)
    const ta = syncedText(a, 'body')
    const tb = syncedText(b, 'body')

    ta.insert(0, 'AAA')
    tb.insert(0, 'BBB')

    // Both peers converge to the SAME string, and it contains BOTH inserts —
    // no character is dropped (contrast syncedSignal, where LWW picks one value).
    expect(ta()).toBe(tb())
    expect(ta()).toContain('AAA')
    expect(ta()).toContain('BBB')
    expect(ta().length).toBe(6)
  })

  it('OFFLINE concurrent edits merge on reconnect (no lost characters)', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ta = syncedText(a, 'body')
    const tb = syncedText(b, 'body')

    ta.insert(0, 'hello ') // edited offline on A
    tb.insert(0, 'world ') // edited offline on B
    connectYDocs(a, b) // reconnect → state-vector merge

    expect(ta()).toBe(tb())
    expect(ta()).toContain('hello')
    expect(ta()).toContain('world')
  })

  it('.dispose detaches the observer', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    t.dispose()
    doc.yDoc.getText('body').insert(0, 'z') // direct mutate after dispose
    expect(t()).toBe('') // observer gone — signal stays at its last value
  })

  it('.set to the same value is a no-op (no transaction)', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    t.set('hello')
    let txns = 0
    doc.yDoc.on('afterTransaction', () => txns++)
    t.set('hello') // identical → early-return, no Y.Text mutation
    expect(txns).toBe(0)
    expect(t()).toBe('hello')
  })

  it('.dispose is idempotent (second call is a no-op)', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    t.dispose()
    t.dispose() // second call hits the `disposed` early-return
    doc.yDoc.getText('body').insert(0, 'z')
    expect(t()).toBe('')
  })
})
