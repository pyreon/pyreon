---
"@pyreon/runtime-server": patch
---

fix(runtime-server): render `innerHTML` / `dangerouslySetInnerHTML` as inner content, not as attributes

`innerHTML` was emitted as a literal HTML attribute on the open tag
(`<span innerHTML="&lt;svg&gt;…">`) instead of as the element's inner
content. Wasted bytes, hydration mismatch, and — combined with the
client-side `innerHTML` bug in the same PR — the literal closure text
was visible on-screen before hydration replaced it with the real SVG.

Fix:
- `renderPropSkipped` now skips `innerHTML` and `dangerouslySetInnerHTML`
  so neither shows up in the open-tag attribute list.
- `streamElementNode` (streaming) and `renderElement` (non-streaming)
  both write them as inner content — unwrapping function-typed values
  emitted by the JSX compiler for signal-derived expressions.

5 new regression tests (`renderToString — innerHTML / dangerouslySetInnerHTML inner-content rendering`).
