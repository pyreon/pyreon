---
'@pyreon/compiler': patch
---

The inline-`<Defer>` pre-pass no longer parses `.ts` / `.js` modules that merely mention `Defer`. The rewrite only matches a JSX `<Defer>` element, and those languages can't contain one, so the result is unchanged. Large non-JSX modules no longer pay for a full parse they can't use: a production `vite build` of `examples/app-showcase` got about 40ms faster.
