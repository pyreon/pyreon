---
'@pyreon/native-compiler': patch
---

Native (PMTC) emit correctness: eight silent wrong-emit classes now lower or warn by name

Every fix here addressed a shape that emitted with ZERO warnings on both targets and either failed to compile or answered differently from the web.

**Lowered**

- TS utility-type annotations no longer leak the TS name into emitted Swift/Kotlin (`Partial<ChartTheme>` emitted `private let T: Partial<ChartTheme>` — `cannot find type 'Partial' in scope` / `unresolved reference`). `Readonly`/`Required`/`NonNullable`/`Awaited`/`NoInfer` and the four string-case utilities erase to their base type; `Record<K, V>` lowers to a real dictionary (type AND literal); everything else warns by name and drops the annotation. The set is the complete `lib.es5.d.ts` list with a totality test.
- `<For>` with no `by` no longer assumes an `id` field: a primitive element keys on the value itself (`\.self` / `it`), and an element that provably has no `id` warns instead of emitting `value of type 'String' has no member 'id'`.

**Narrowed to match the web**

- `Math.round` on iOS was `.rounded()` (ties away from zero) where JS and Kotlin are `floor(x + 0.5)` — the two disagree on every negative half.
- `String.length` on iOS was `.count` (grapheme clusters) where JS and Kotlin count UTF-16 units (`"👍".length` was 1 instead of 2). Array `.length` is unchanged.
- `toFixed` on Android used the DEVICE locale, yielding `1234,57` where JS and Swift give `1234.57`.

**Now loud instead of silent**

- Unmapped `Array`/`String` methods (`toSorted`, `pop`, `entries`, `reduceRight`, `codePointAt`, `substr`, …) and `.sort()` with no comparator, which fell through to a verbatim re-emit.
- `||` / `&&` on a non-boolean operand (`name() || 'anon'`), which Swift and Kotlin reject as Bool-only operators.
- `{items.map((x) => <Row/>)}` as a child, which was interpolated into a string on both targets. The warning names `<For>`.
- Dynamic values on `<Video>`/`<Audio>` (`controls`, `muted`, `loop`, `autoPlay`, `volume`) and `<Text truncate>`, which emitted byte-identically to omitting the prop.

**Also**

- `useSortable` / `useForm` / `useRateLimited` / `useHotkey` now get the stable-identity SwiftUI host their `.onAppear` needs; the hand-listed gate is replaced by a set with a test that derives the answer from the emitter source.
- The committed native chart engine regenerates with the corrected rounding and string-length forms (20 lines of axis-label formatting were diverging on iOS).
