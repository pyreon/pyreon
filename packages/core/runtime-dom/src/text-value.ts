import { _childText } from '@pyreon/core/internal'

/**
 * The client side of the child-text rule, for every text write: a text value
 * is never stringified in JS when the DOM can take it as is.
 *
 * JS-side Number→String (`String(n)`, `n + ''`, a template literal) of more
 * than ~200 distinct integers makes V8 grow its Number→String cache
 * (`smi_string_cache`, a GC root) to its full ~64 KB, and the page never gets
 * it back. The DOM's own conversion (WebIDL `DOMString`, which is ECMAScript
 * `ToString`, so the characters are identical) does not touch that cache. A
 * counter, a timer, a price or a table cell bound to a number signal crosses
 * 200 distinct values quickly.
 *
 * So a text binding hands the DOM a string or a NUMBER as is, and remembers the
 * RAW value it wrote for its next "did it change" check. Everything else goes
 * through `_childText` (nullish and booleans render nothing, an array
 * concatenates, an object renders its `String()`), exactly as before.
 */
export type TextValue = string | number

/** The value a text binding hands the DOM for `v`. */
export function textValue(v: unknown): TextValue {
  return typeof v === 'string' || typeof v === 'number' ? v : _childText(v)
}

/**
 * Has the text changed since `written` (the raw value last written, the
 * server's string on an adopted node's first run, `undefined` on a fresh
 * clone)? Compared raw (`-0` equals `0`, as their text does; a re-run that
 * yields `NaN` again rewrites "NaN", which a signal never notifies anyway). A
 * number against a string (`1` then `'1'`, or a number over adopted
 * server text) is compared through the DOM's own conversion (`domText`), so a
 * value that keeps its text is never rewritten. That costs one scratch-node
 * write on the type-mixed path only (Chromium ~46 ns, against ~37 ns for the
 * redundant write it saves, which would also queue a MutationObserver record).
 */
export function textChanged(next: TextValue, written: TextValue | null | undefined): boolean {
  return (
    next !== written &&
    (typeof next === typeof written || written == null || domText(next) !== domText(written))
  )
}

/**
 * The text a value renders as, with a NUMBER converted by the DOM (a text
 * node's WebIDL `DOMString` conversion): the characters `String(n)` gives,
 * without touching V8's Number→String cache. For the places that must compare
 * a number with text already in the page (an adopted node's server text, a
 * value that changed type, a mismatch report) or measure it (`splitText`).
 * Allocates a detached node, which is fine for those rare paths. Through
 * `document`, never the global `Text` constructor: not every DOM a renderer
 * runs in defines it (atlas's server-side DOM does not).
 */
export function domText(v: TextValue): string {
  return document.createTextNode(v as string).data
}
