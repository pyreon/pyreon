---
'@pyreon/zero-content': minor
---

PR-M — math + mermaid + details directives (audit M6+M7+M8)

Three new `:::` block directives recognised by the markdown pipeline,
each emitting a JSX element the consumer can render:

- **M6** — `:::math` block for LaTeX. Body extracted verbatim from
  the raw source (curly braces / backslashes / `^` survive remark-
  parse's markdown inline transformations). `:::math inline` renders
  in display:inline mode. Emits `<Math>` which dynamically imports
  KaTeX on the client; SSR + no-KaTeX builds render a `<code>`
  fallback so the LaTeX source is always surfaced.

- **M7** — `:::mermaid` block for diagrams. Emits `<Mermaid>` which
  dynamically imports mermaid on the client; SSR + no-mermaid builds
  render a `<pre><code>` fallback.

- **M8** — `:::details[Label]` block for collapsible disclosure.
  Emits `<Details>` which renders native `<details>` + `<summary>`.
  No peer deps required.

All three components added to `BUILT_IN_COMPONENTS` (Details / Math /
Mermaid). Both KaTeX and mermaid are optional peer dependencies —
consumers install them only if they want client-side rendering.

10 new specs cover the three directives + components; M6 bisect-
verified by short-circuiting the `math` case in the remark plugin.
