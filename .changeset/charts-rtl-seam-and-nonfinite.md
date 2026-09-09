---
'@pyreon/charts': patch
---

Nine pre-release fixes in `@pyreon/charts/plot`, sharing one theme — an input the types allowed reaching a path that never considered it.

**RTL is a TWO-WAY seam, and only one direction was centralized.** `mirrorCmds` (chart → pixels) and `localX`/`localPoint` (screen → chart) were both in `./rtl`; the chart → SCREEN direction had no home, so both hosts wrote a chart-space x straight to the tooltip's `style.left` — a cursor at x=60 on a 400px `rtl` chart put the tooltip at `left:248px`, the mirror image of the pointer. Added `screenX` / `screenRectX` (a BOX mirrors by its far edge, so the point and rect forms differ), both exported from `@pyreon/charts/plot` so a custom host uses the same seam. The same gap in a second guise: `toolbox saveAsImage: 'svg'` serialized `lastFrame`, captured BEFORE the mirror — the SVG export was byte-identical in `rtl` and `ltr` while the PNG was mirrored.

**`rtl` on `<OptionChart>` was typed, documented and silently dropped** — the facade hand-listed the props it forwards to the shared canvas host and never added it. The passthrough is now a map the type system requires to be TOTAL over `CanvasHostProps`, so a new host prop is a compile error until it is forwarded or explicitly omitted.

**A non-finite value is a GAP wherever a NaN was one.** Several entry points tested `v === v`, which is a NaN check written as a finiteness check: an `Infinity` reached the geometry. `makeTicks` emitted 1000 NaN ticks for a non-finite bound (now zero); `extent` returned a NaN domain from one bad sample; `fiveNumber` produced 242KB of NaN SVG from one `Infinity` while its own docblock said non-finite values are dropped. Closed at every entry point user data reaches without `marks.ts`' coercion — bars, grouped/stacked bars, waterfall, parallel coordinates, calendar, bin, boxplot, bubble, geo, heat, navigator, polar, river, the tooltip, the accessible table and `sonifyValues`. `isFiniteNumber` is the one predicate (written in the native subset — `Number.isFinite` has no lowering in the crossing engine) and is exported.

**`sonifyValues` constructed an `AudioContext` per `play()` and never closed one.** Chrome caps live contexts at ~6 per document, so the seventh press threw `NotSupportedError`. One context is now owned per hook, created lazily and closed when the run settles or is stopped; a caller-supplied `options.context` is never closed.

**`<For>` inside `<Plot>` rendered zero marks, silently.** The child walk handled function children, arrays, `<Show>` and fragments but not `<For>`, and an unrecognized child was `continue`d with no diagnostic. `<For each>` now resolves through its render callback like a `.map()` child, and anything that is not a mark warns in dev naming the tag.

**A server-rendered `<canvas>` carried no size** — `prepareCanvas` only runs on the client, so every hydrated chart laid out at the HTML default (300x150) and jumped to its real box on the first paint. The width/height and CSS box are now emitted as attributes when known.

Also: `DEFAULT_PALETTE` / `DARK_PALETTE` are `readonly string[]`; the `accessibleTable` JSDoc is reattached to its property; and `rtl.ts` cited a `mirror-parity.test.ts` that has never existed (the real one is `packages/native/compiler/src/tests/native-chart-mirror-parity.test.ts`).

The crossing engine sources changed, so the generated native engine is regenerated (byte-identical drift lock, zero transform warnings).
