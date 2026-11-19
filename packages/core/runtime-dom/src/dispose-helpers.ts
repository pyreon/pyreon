// ─── Template cleanup helpers ───────────────────────────────────────────────
// A compiled template with several disposers returns ONE cleanup that runs
// them all. Written inline as `return () => { __d0(); __d1() }`, that closure
// is created inside the bind arrow, so its context chain reaches the
// COMPONENT function's context: it kept the component's `props` and every
// local the body captured alive for the template's whole lifetime, even when
// no binding read them. Built here instead, the closure's context holds only
// the disposers and chains to this module. Same disposal order as the arrow.

/** @internal Compiler-emitted: cleanup for a template with two disposers. */
export function _dispose2(a: () => void, b: () => void): () => void {
  return () => {
    a()
    b()
  }
}

/** @internal Compiler-emitted: cleanup for a template with three disposers. */
export function _dispose3(a: () => void, b: () => void, c: () => void): () => void {
  return () => {
    a()
    b()
    c()
  }
}

/** @internal Compiler-emitted: cleanup for a template with four disposers. */
export function _dispose4(a: () => void, b: () => void, c: () => void, d: () => void): () => void {
  return () => {
    a()
    b()
    c()
    d()
  }
}

/** @internal Compiler-emitted: cleanup for a template with five or more disposers. */
export function _disposeN(ds: (() => void)[]): () => void {
  return () => {
    for (let i = 0; i < ds.length; i++) (ds[i] as () => void)()
  }
}
