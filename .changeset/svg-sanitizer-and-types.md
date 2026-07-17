---
"@pyreon/runtime-dom": patch
"@pyreon/core": patch
---

fix(runtime-dom,core): allow safe SVG through the innerHTML sanitizer, and add `mask`/`<image>` + downstream augmentation to SVG types

Two SVG gaps a downstream report surfaced:

**`innerHTML` silently stripped all SVG** (`@pyreon/runtime-dom`). The fallback sanitizer's allowlist held only HTML tags, so `<span innerHTML="<svg>…</svg>">` had every SVG element replaced with a text node — an entire icon set could render blank with no error or warning, and the only escape (`setSanitizer`) is global. A curated safe-SVG profile (shape / gradient / clip / mask / text / filter-primitive elements, mirroring DOMPurify's default SVG profile) now passes through, while `<script>`, `<foreignObject>`, `<style>`, and SMIL animation elements stay excluded and `on*` / `javascript:` (now including `xlink:href`, whose localName the URL guard previously missed) are still stripped.

**SVG types missing `mask`, `<image>`, and augmentability** (`@pyreon/core`). `SvgAttributes` had `maskUnits`/`maskContentUnits` (attributes OF a `<mask>`) but not `mask` (the reference TO one), plus no `filter`, opacity/dash, or filter-primitive attributes; `JSX.IntrinsicElements` lacked `<image>` and every SVG filter element (they fell through to the HTML catch-all and lost SVG typing). All added. SVG attributes are augmentable downstream via `declare module '@pyreon/core' { interface SvgAttributes { … } }` (now documented in the `SvgAttributes` JSDoc) — use that form, not `declare global { namespace JSX }`, which declares a separate interface that does not merge.
