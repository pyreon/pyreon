/**
 * Tracking-frame helpers over the graph core (`graph.ts`).
 *
 * Kept as its own module for the names other packages and tests import:
 * `runUntracked`, `trackSubscriber`, the `SubscriberHost` type and the read-replay trio `runtime-dom` uses to hand an
 * evaluated accessor's dependencies to the binding that owns it.
 */
import {
  F_DIRTY,
  type Link,
  type Source,
  type Subscriber,
  _t,
  link,
  runUntracked,
  trackSubscriber,
  unlinkAllDeps,
} from './graph'

export { _t, runUntracked, trackSubscriber }

/**
 * Subscriber host — any reactive source that can have downstream subscribers:
 * signals, computeds and `createSelector` key buckets. Opaque outside this
 * package: hold it, hand it back to `_replayReads`, never read its fields.
 */
export type SubscriberHost = Source

/**
 * @internal The sources the CURRENT run has read so far, in order (a copy),
 * or `null` outside any tracking frame. With `_replayReads` this lets a caller
 * that already evaluated an accessor once (to classify its value) hand the
 * value AND its dependencies to the machinery that owns the binding, instead
 * of that machinery calling the accessor — user code — a second time.
 */
export function _frameReads(): SubscriberHost[] | null {
  const sub = _t.e
  if (sub === null) return null
  const out: SubscriberHost[] = []
  const tail = sub._depsTail
  if (tail === null) return out
  for (let l: Link | null = sub._deps; l !== null; l = l.nextDep) {
    out.push(l.dep)
    if (l === tail) break
  }
  return out
}

/**
 * @internal Record `hosts` as reads of the current tracking frame, in order —
 * exactly what reading each source again would record, without re-running
 * the code that read them.
 */
export function _replayReads(hosts: readonly SubscriberHost[]): void {
  const sub = _t.e
  if (sub === null) return
  for (let i = 0; i < hosts.length; i++) link(hosts[i] as SubscriberHost, sub)
}

/**
 * The subscriber `_sampleReads` tracks into. Permanently marked DIRTY, so a
 * write during the sample never queues it (marking stops at marked nodes);
 * its edges are dropped before `_sampleReads` returns.
 */
class SampleNode implements Subscriber {
  _f = F_DIRTY
  _deps: Link | null = null
  _depsTail: Link | null = null
}

/**
 * @internal Evaluate `fn` once in its own tracking frame and return its value,
 * appending every source it read to `reads`. No subscription survives.
 */
export function _sampleReads<T>(fn: () => T, reads: SubscriberHost[]): T {
  const node = new SampleNode()
  const prev = _t.e
  _t.e = node
  try {
    return fn()
  } finally {
    _t.e = prev
    for (let l = node._deps; l !== null; l = l.nextDep) reads.push(l.dep)
    unlinkAllDeps(node)
  }
}
