// Premise lock for the syncedText `.set` prev fast path.
//
// The fast path reads `base.peek()` as `prev` instead of re-materializing
// `ytext.toString()` (a second O(docLen) walk per keystroke). That is sound
// ONLY under the premise: the Y.Text observer is the SOLE base writer and Yjs
// fires it synchronously when the outermost transaction commits — so OUTSIDE a
// transaction (and outside the observer/cleanup phase, and before dispose)
// `base` is an exact mirror of `ytext.toString()`.
//
// This file locks BOTH halves:
//   • the MIRROR premise across local sets, positional ops, remote
//     transactions, and interleavings (specs 1-4 — these fail if the observer
//     ever skips a path);
//   • the GUARD's fallback on the paths where the premise does NOT hold —
//     inside an outer `doc.transact` (observers deferred), re-entrant sets
//     from a subscriber (observer/cleanup phase), and after dispose (observer
//     detached) — where `.set` must still diff against the REAL text (specs
//     5-7 — these fail if the fast path ships unguarded).
import { describe, expect, it } from 'vitest'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { syncedText } from '../crdt/yjs-text'
import { connectYDocs } from '../crdt/yjs-transport'

const mirror = (t: ReturnType<typeof syncedText>, doc: ReturnType<typeof createYjsDoc>) => {
  expect(t.peek()).toBe(doc.yDoc.getText('body').toString())
}

describe('syncedText — base mirrors ytext (the .set prev fast-path premise)', () => {
  it('holds after every local .set shape (append, middle replace, shrink, clear)', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    mirror(t, doc) // at first-.set entry
    for (const next of ['hello', 'hello world', 'hellp world', 'hp world', 'x', '']) {
      t.set(next)
      mirror(t, doc) // at the NEXT .set's entry, prev === real text
      expect(t.peek()).toBe(next)
    }
  })

  it('holds after positional .insert / .delete (the concurrent-editing ops)', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    t.insert(0, 'hello world')
    mirror(t, doc)
    t.delete(0, 6)
    mirror(t, doc)
    t.insert(5, '!!!')
    mirror(t, doc)
    expect(t.peek()).toBe('world!!!')
  })

  it('holds across REMOTE transactions (live link + offline merge)', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    connectYDocs(a, b)
    const ta = syncedText(a, 'body')
    const tb = syncedText(b, 'body')
    tb.insert(0, 'remote edit') // arrives at A via a remote-origin transaction
    mirror(ta, a)
    mirror(tb, b)
    expect(ta.peek()).toBe('remote edit')

    // Offline concurrent edits + reconnect merge — the observer must fire for
    // the merge transaction too.
    const c = createYjsDoc()
    const d = createYjsDoc()
    const tc = syncedText(c, 'body')
    const td = syncedText(d, 'body')
    tc.insert(0, 'AAA')
    td.insert(0, 'BBB')
    connectYDocs(c, d)
    mirror(tc, c)
    mirror(td, d)
    expect(tc.peek()).toBe(td.peek())
  })

  it('holds through local/remote INTERLEAVINGS, and a .set right after a remote edit diffs correctly', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    connectYDocs(a, b)
    const ta = syncedText(a, 'body')
    const tb = syncedText(b, 'body')

    ta.set('shared doc')
    mirror(ta, a)
    mirror(tb, b)
    tb.insert(0, '>> ') // remote (from A's perspective)
    mirror(ta, a)
    // The keystroke-after-remote-edit shape: prev MUST include the remote
    // insert or the diff below would corrupt the text. This is the spec that
    // catches a stale-prev fast path end-to-end.
    ta.set(`${ta.peek()}!`)
    expect(ta.peek()).toBe('>> shared doc!')
    expect(a.yDoc.getText('body').toString()).toBe('>> shared doc!')
    mirror(ta, a)
    mirror(tb, b)
    expect(tb.peek()).toBe('>> shared doc!')
  })
})

describe('syncedText — .set falls back where the mirror premise does NOT hold', () => {
  it('inside an outer doc.transact (observers deferred → base is stale mid-transaction)', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    t.set('hello')
    doc.yDoc.transact(() => {
      // Direct ytext mutation inside the outer transaction: the observer has
      // NOT fired yet, so base still says 'hello' while the text is 'XXhello'.
      doc.yDoc.getText('body').insert(0, 'XX')
      // A .set here MUST diff against the REAL text — an unguarded base.peek()
      // prev would compute a corrupting diff.
      t.set('XXhello world')
    })
    expect(doc.yDoc.getText('body').toString()).toBe('XXhello world')
    expect(t.peek()).toBe('XXhello world')
  })

  it('a SIBLING observer firing BEFORE ours in the same transaction (observer phase, base stale)', () => {
    // One transaction touches a Y.Map and the Y.Text, map FIRST — Yjs fires
    // type observers in modification order, so the map observer runs while the
    // text observer (the sole base writer) has NOT yet seen the text change.
    // A .set from that map observer sees a base that is stale w.r.t. the SAME
    // transaction's text edit — the exact window the guard's cleanup-phase
    // fallback exists for. Unguarded base.peek() prev corrupts the text here.
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    t.set('hello')
    const ymap = doc.yDoc.getMap('meta')
    ymap.observe(() => {
      if (ymap.get('k') === 1) t.set('XXhello world')
    })
    doc.yDoc.transact(() => {
      ymap.set('k', 1) // map first → its observer fires first
      doc.yDoc.getText('body').insert(0, 'XX') // text second → base stale at map-observer time
    })
    expect(doc.yDoc.getText('body').toString()).toBe('XXhello world')
    expect(t.peek()).toBe('XXhello world')
  })

  it('re-entrant .set from a subscriber (observer/cleanup phase) converges', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    let reentered = false
    t.subscribe(() => {
      if (!reentered && t.peek() === 'trigger') {
        reentered = true
        t.set('trigger + reaction')
      }
    })
    t.set('trigger')
    expect(doc.yDoc.getText('body').toString()).toBe('trigger + reaction')
    expect(t.peek()).toBe('trigger + reaction')
  })

  it('after dispose (observer detached → base permanently stale) .set still diffs against the real text', () => {
    const doc = createYjsDoc()
    const t = syncedText(doc, 'body')
    t.set('hello')
    t.dispose()
    doc.yDoc.getText('body').insert(5, ' there') // base now stale ('hello' vs 'hello there')
    t.set('hello there world') // must diff against 'hello there', not base's 'hello'
    expect(doc.yDoc.getText('body').toString()).toBe('hello there world')
  })
})
