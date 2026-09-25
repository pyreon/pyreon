/**
 * The edge API's no-op guards, deduplication, and connect-listener payload.
 *
 * Every mutating edge operation opens with an early return for the empty or
 * already-satisfied case, and each of those guards sits in front of
 * `checkpoint()`. That ordering is the whole point: a call that changes
 * nothing must not push a history entry, because an undo stack with a
 * no-op entry costs the user a Cmd-Z that visibly does nothing — they press
 * it, the diagram does not move, and the change they actually wanted to
 * revert is still there. It reads as a broken undo, not as a redundant
 * call, so it is a bug in the feature the user notices most.
 *
 * These guards had no tests. The suite drives them through the undo stack
 * rather than by asserting "the edge list is unchanged", because an
 * unchanged edge list is exactly what a BROKEN guard also produces — the
 * checkpoint is the only observable difference, and one `undo()` reverting
 * the previous real change is how a user would notice.
 *
 * Deduplication is the same class from the other side: `addEdges` filters
 * against existing ids AND within its own batch, so a re-emitted payload
 * from a subscription is idempotent rather than doubling every edge.
 */
import { describe, expect, it, vi } from 'vitest'
import { createFlow } from '../flow'
import type { Connection, FlowEdge } from '../types'

const graph = () =>
  createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 100, y: 0 }, data: {} },
      { id: 'c', position: { x: 200, y: 0 }, data: {} },
    ],
    edges: [],
  })

const e = (id: string, source = 'a', target = 'b'): FlowEdge => ({ id, source, target })

describe('an edge call that changes nothing costs no undo step', () => {
  /**
   * Make one real change, then the call under test, then a SINGLE undo.
   * If the call pushed a checkpoint, that undo is spent on the no-op and
   * the real change survives — which is what the assertion catches.
   */
  const undoSurvivesNoop = (noop: (f: ReturnType<typeof graph>) => void): number => {
    const f = graph()
    f.addEdge(e('real'))
    expect(f.getEdges(), 'the real change must land first').toHaveLength(1)
    noop(f)
    f.undo()
    return f.getEdges().length
  }

  it('removeEdges([]) does not push a history entry', () => {
    expect(undoSurvivesNoop((f) => f.removeEdges([])), 'one undo must revert the real edge').toBe(0)
  })

  it('removeEdges of ids that are not in the graph does not either', () => {
    // The ordinary shape: a deletion driven by a selection that has already
    // been pruned, or a stale id from a subscription.
    expect(undoSurvivesNoop((f) => f.removeEdges(['ghost', 'phantom']))).toBe(0)
  })

  it('addEdges([]) does not push a history entry', () => {
    expect(undoSurvivesNoop((f) => f.addEdges([]))).toBe(0)
  })

  it('addEdges of only-already-present edges does not either', () => {
    // A re-emitted payload from a live subscription is the common cause,
    // and it arrives repeatedly — so a checkpoint here would bury the
    // user's real history under identical snapshots.
    expect(undoSurvivesNoop((f) => f.addEdges([e('real')]))).toBe(0)
  })

  it('addEdge with a duplicate id is ignored entirely', () => {
    const f = graph()
    f.addEdge(e('dup', 'a', 'b'))
    f.addEdge({ ...e('dup', 'b', 'c') })
    expect(f.getEdges(), 'the second call must not add or replace').toHaveLength(1)
    expect(f.getEdges()[0]!.target, 'the FIRST registration wins').toBe('b')
  })
})

describe('addEdges is idempotent', () => {
  it('drops entries whose id already exists', () => {
    const f = graph()
    f.addEdges([e('e1'), e('e2', 'b', 'c')])
    f.addEdges([e('e1'), e('e3', 'a', 'c')])
    expect(f.getEdges().map((x) => x.id).sort()).toEqual(['e1', 'e2', 'e3'])
  })

  it('drops duplicates WITHIN a single batch', () => {
    // The within-call dedupe is a separate guard from the against-existing
    // one: a payload that repeats an id inside itself would otherwise add
    // it twice in one go, and the second copy is unreachable by id-based
    // removal afterwards.
    const f = graph()
    f.addEdges([e('same'), e('same', 'b', 'c'), e('other', 'b', 'c')])
    expect(f.getEdges().map((x) => x.id).sort()).toEqual(['other', 'same'])
  })

  it('still adds the fresh entries when a batch is only partly duplicated', () => {
    // The guard must filter, not bail — an early return on "any duplicate"
    // would silently drop every new edge in a re-emitted payload.
    const f = graph()
    f.addEdges([e('e1')])
    f.addEdges([e('e1'), e('e2', 'b', 'c')])
    expect(f.getEdges().map((x) => x.id).sort()).toEqual(['e1', 'e2'])
  })
})

describe('programmatic edge additions are onEdgesChange events, not onConnect', () => {
  // onConnect is reserved for the USER gesture (a handle drag resolved by the
  // renderer), matching React Flow and the native runtimes; the gesture path
  // is locked in gesture-hardening.browser.test.tsx.
  it('addEdge / addEdges never fire onConnect', () => {
    const f = graph()
    const seen: Connection[] = []
    f.onConnect((c) => seen.push(c))
    f.addEdge(e('one'))
    f.addEdges([{ id: 'h', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' }])
    expect(seen).toEqual([])
  })

  it('add changes carry the handle fields exactly as given, once per FRESH edge', () => {
    const f = graph()
    const added: FlowEdge[] = []
    f.onEdgesChange((changes) => {
      for (const c of changes) if (c.type === 'add') added.push(c.edge)
    })
    f.addEdges([{ id: 'h', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' }, e('plain', 'b', 'c')])
    f.addEdges([e('plain', 'b', 'c')])
    expect(added.map((x) => x.id), 'the duplicate must not re-notify').toEqual(['h', 'plain'])
    expect(added[0]).toMatchObject({ sourceHandle: 'out', targetHandle: 'in' })
    expect('sourceHandle' in added[1]!, 'sourceHandle must be absent').toBe(false)
  })
})

describe('addEdge names a dangling endpoint in dev', () => {
  // The edge is KEPT — a node arriving after its edges is a legitimate
  // load order — so the warning is the only signal that separates that
  // from a typo'd id, which would otherwise hide for a whole session.
  it('names ONE missing endpoint in the singular', () => {
    const f = graph()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    f.addEdge(e('dangling', 'a', 'ghost'))
    expect(warn).toHaveBeenCalledOnce()
    const msg = warn.mock.calls[0]!.join(' ')
    expect(msg).toContain('"ghost"')
    expect(msg, 'singular phrasing for one id').toContain('until it exists')
    expect(f.getEdges(), 'and the edge is still kept').toHaveLength(1)
    warn.mockRestore()
  })

  it('names BOTH missing endpoints in the plural', () => {
    const f = graph()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    f.addEdge(e('dangling', 'x', 'y'))
    const msg = warn.mock.calls[0]!.join(' ')
    expect(msg).toContain('"x"')
    expect(msg).toContain('"y"')
    expect(msg, 'plural phrasing for two ids').toContain('until they exist')
    warn.mockRestore()
  })

  it('stays quiet when both endpoints resolve', () => {
    // The control. Without it the specs above pass against a warning that
    // fires unconditionally, which would make it useless noise.
    const f = graph()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    f.addEdge(e('fine', 'a', 'b'))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
