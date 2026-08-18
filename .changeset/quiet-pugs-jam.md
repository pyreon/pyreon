---
'@pyreon/core': patch
---

perf(core): cut two allocations per JSX element and one per reactive prop on the component-mount path

Attribution for the deep-component-tree mount scenario (2,047 components) put
29% of self time in the props pipeline, ahead of every DOM call. Two changes,
both allocation removals on paths that run once per component:

- **`jsx()` zero-copy path.** When an element has no `children` and no `key`,
  both existing paths reduce to "hand `props` through unchanged" — the
  value-copy branch copies every data property, the descriptor branch
  re-defines every descriptor, and neither adds or removes a key. The original
  object is exactly what they produce, so it now goes straight to `h()`. That
  skips `Object.getOwnPropertyDescriptors` (one descriptor object PER KEY, plus
  the container) and the rest-spread. It also preserves getter-shaped reactive
  props by construction, because nothing is read. Covers the dominant childless
  shapes: `<Comp prop={x} />`, `<img src=… />`, `<Icon name=… />`.

- **`makeReactiveProps()` single pass.** Was scan-then-build, reading every key
  twice for any component carrying a compiler-wrapped reactive prop. Now copies
  on first reactive prop and backfills the keys already scanned. All-static
  components still return the input object untouched, which is the property the
  scan-first shape existed to guarantee.

Measured on that scenario with both builds served at once and the arms
alternated per pass, so both see the same machine: **4.90 → 4.50 ms, −8.2%,
confidence intervals separated** (60 samples per cell). Vanilla, SolidJS, React,
Preact and Vue all stayed inside their intervals across every run, which is the
control a Pyreon-only change has to pass. Context propagation over the same tree
is unchanged.

No API change and no behavioural change; the getter-preservation contract that
these paths exist to protect is unchanged and newly pinned by regression specs
for the key, inherited-`children`, and live-getter cases.
