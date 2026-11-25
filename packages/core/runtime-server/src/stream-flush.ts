/**
 * Output batching threshold for `renderToStream`, in string length.
 *
 * The stream used to `controller.enqueue` every fragment the walker produced —
 * each open tag, text node and close tag — so a 3.3 KB h()-built page went out
 * as 314 chunks, each paying a queue + consumer read. Fragments are now
 * accumulated and handed over (a) whenever the batch reaches this size, and
 * (b) at every point the render is about to WAIT: before an async component or
 * async hole is awaited, at the end of the shell, after each Suspense swap
 * script, and on close/error. (b) is what keeps streaming semantics intact —
 * nothing the client could already render sits in the buffer while the server
 * waits. The concatenated output is byte-identical; only chunk boundaries move.
 */
export let STREAM_FLUSH_BYTES = 4096

/**
 * @internal Test-only: set the batching threshold (`0` = hand every fragment
 * over as produced, the pre-batching behaviour). Returns the previous value.
 */
export function _setStreamFlushBytes(n: number): number {
  const prev = STREAM_FLUSH_BYTES
  STREAM_FLUSH_BYTES = n
  return prev
}
