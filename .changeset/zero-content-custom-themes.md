---
'@pyreon/zero-content': minor
---

feat(zero-content): accept custom Shiki theme objects (not just bundled names)

`HighlighterOptions.themes` now accepts `ShikiTheme = string | Record<string, unknown>` — either Shiki's bundled theme names (`'github-dark'`) OR a custom `ThemeRegistrationAny` object. Custom themes get their `.name` property extracted automatically for the per-code-block `codeToHtml` call that references them.

Enables the docs-zero migration to ship the brand-handoff `pyreon-syntax` themes (verbatim port from VitePress's `markdown.theme: { light, dark }` config) without forking the highlighter.
