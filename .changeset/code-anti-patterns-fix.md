---
"@pyreon/code": patch
"@pyreon/lint": patch
---

Code editor anti-pattern cleanup + lint rule precision

`@pyreon/code`:

- `editor.ts` `CustomGutterMarker.toDOM()`: added `typeof document === 'undefined'`
  early-return — the method is only invoked by CodeMirror at render time
  in a mounted browser, but the explicit guard documents the SSR-safety
  contract at the callsite.
- `minimap.ts` `createMinimapCanvas` / plugin `update()` / `destroy()`: same
  pattern — typeof guards at function entry. The class-method paths only
  fire from the CodeMirror plugin lifecycle (browser-only) but the rule
  can't AST-trace that.
- `bind-signal.ts` + 4 `editor.ts` computed/effect blocks: added inline
  `// pyreon-lint-disable-next-line pyreon/no-peek-in-tracked` suppressions
  for the canonical loop-prevention and imperative-ref-access uses of
  `.peek()`. These are intentional and correct — `.peek()` is THE official
  way to read a signal without subscribing.

`@pyreon/lint`:

- `no-window-in-ssr`: import-name shadowing — `import { history } from
  '@codemirror/commands'` makes every later `history` identifier in the
  file refer to the import, not `window.history`. Same for default
  (`import history from …`) and namespace (`import * as history from …`)
  imports.
- Runner suppression-comment alias: the `// pyreon-lint-disable-next-line
  <rule-id>` syntax is now a recognised alias of the existing
  `// pyreon-lint-ignore <rule-id>` syntax. Several rule docstrings already
  documented `disable-next-line` — closing the docs / runtime gap.

6 new bisect-verified regression tests for the rule + suppression changes.
