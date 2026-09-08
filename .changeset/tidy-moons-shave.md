---
'@pyreon/validate': patch
'@pyreon/kinetic': patch
'@pyreon/styler': patch
---

Three silent-wrong-answer fixes, one per package.

**`@pyreon/validate` — `.strict()` short-circuited on a key COUNT, which is not a membership test.** Both strict emitters reduced "no unknown keys" to `Object.keys(x).length === N`, on the premise that the field checks had proven all N declared keys present — but a field check reads `x.name`, which walks the prototype chain. So `Object.create({ name, age })` (and any class instance whose fields are prototype getters) had `is()` return `false` while `parse().ok` was `true`, breaking the locked `is() ⇔ parse().ok` invariant; and `{ nmae: 'Ada', age: 36 }` — a typo'd key in place of a real one, keeping the own-key count at N — never reported `Unrecognized key "nmae"`, which is the case `.strict()` exists for. The short-circuit now proves membership (count is N **and** every declared key is `Object.hasOwn`) before skipping the scan; anything else falls through to the interpreter's own per-key predicate.

**`@pyreon/kinetic` — `show={signal}` rendered permanently invisible.** Every kinetic surface normalized `props.show` to an accessor at component setup. The compiler emits `show={isOpen}` as an `_rp` getter, so that single read fired the getter outside any tracking scope and froze the "accessor" on a snapshot: the element mounted hidden and never left — silently, since children stay mounted and nothing throws. `show` is now read from its holder inside the accessor, per call, at all five call sites (`Transition` ×2, `Collapse`, `useTransitionState`, `kinetic(tag)`), matching `<Show>`'s `callWhen(props.when)`.

**`@pyreon/styler` — the second streaming SSR request shipped class names with no CSS.** The per-request bag scoped the SSR buffer and its flush watermark, but the className dedup stayed per-instance and `insert()` returned on a cache hit before any buffer push. So a request rendering a class an earlier request had already inserted flushed an empty `<style>`. Buffer dedup is now scoped like the buffer, and every SSR emit path — the scoped insert, both cache-hit returns, `insertKeyframes`, `insertGlobal`, and `injectRules` (collapsed rocketstyle bundles, which had the identical hole through its own per-instance `injectedBundles` dedup) — pushes through one predicate. `getStyleTag()`, the seam `renderPage` collects string-mode SSR through, was affected the same way and is covered.
