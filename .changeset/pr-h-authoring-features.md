---
'@pyreon/zero-content': minor
---

PR-H — markdown authoring features (audit M1+M2+M3+M4+M5+M12+M16)

Seven independent fixes, one PR:

- **M1**: line highlighting via `\`\`\`ts {1,3-5}` meta token. Compiles to
  `<CodeBlock highlightLines={[1,3,4,5]}>` which lands on a
  `data-pyreon-highlight-lines` attribute consumers style via CSS.
- **M2**: line numbers via `\`\`\`ts showLineNumbers` meta. The
  CodeBlock component renders a gutter span per line so CSS counters
  stay structural without re-flowing Shiki HTML.
- **M3**: copy button on code blocks (default on, opts out via
  `noCopy`). Reads `props.source` at click time. `filename="..."`
  meta token renders a header above the block.
- **M4**: diff syntax — Shiki already ships the `diff` grammar; the
  lang prop now flows through consistently for CSS styling.
- **M5**: footnote support — emits `footnoteReference` as
  `<sup class="footnote-ref"><a>` and `footnoteDefinition` as
  `<li class="footnote-definition">`.
- **M12**: data-lang consistency. Both highlighted AND plain code
  blocks now ship through `<CodeBlock>`, so authoring features
  (filename header, copy button, line numbers) stay consistent
  regardless of Shiki being enabled.
- **M16**: visible warning on unhandled mdast nodes. Pre-fix the
  emitter silently emitted a JSX comment that vanished in production
  (JSX comments tree-shake). The fallback now fires
  `onUnhandledNode` which surfaces through `this.warn(...)` AND
  emits a grep-able string comment in the rendered output.

30 new specs cover the seven contracts; bisect-verified across M1
(drop highlightLines prop emission) and M16 (drop the
onUnhandledNode invocation).
