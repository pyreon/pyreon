---
'@pyreon/code': minor
---

**Breaking (pre-1.0):** grammars now load from a REGISTRY, and the core registers only the JavaScript family (js/ts/jsx/tsx — one package) plus JSON. Every other built-in grammar moves behind a new `@pyreon/code/languages-all` entry:

```ts
import '@pyreon/code/languages-all' // css, python, markdown, html, rust, sql, xml, yaml, cpp, java, go, php, ruby, shell
```

Why: a dynamic `import()` is lazy at RUNTIME but not to a bundler's dependency scanner, which follows the specifier at build / dev-server-start time. The old single map naming eighteen `@codemirror/lang-*` packages therefore pulled the whole language ecosystem into every consumer's pre-bundle step, even one that only ever shows TSX — measured taking a dev-server-backed command from ~27s to over five minutes. The map's "only the requested language is imported" comment held for the shipped bundle and quietly failed for the dep graph.

New API: `registerLanguage(id, loader)` (plus the `LanguageLoader` type) registers a grammar the package does not ship, or replaces one that it does.

Also: an unregistered or failed grammar still mounts the editor unhighlighted — as before — but now WARNS in dev naming the fix, instead of returning an empty extension silently. "The editor renders but nothing is coloured, and nothing says why" was close to undiagnosable.

And the package's headline feature finally has tests: real-Chromium specs assert CodeMirror emits highlight spans, including in the read-only/no-gutter/wrapped shape a docs surface uses.
