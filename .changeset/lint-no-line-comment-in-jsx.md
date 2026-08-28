---
'@pyreon/lint': minor
---

New rule `pyreon/no-line-comment-in-jsx` (error, in `recommended`).

JSX has no line comments. A `// …` line in child position is JSXText, so it
RENDERS — on web, and through PMTC as a native `Text` node on iOS and Android.
Developer prose ends up in the running UI on every target with nothing said by
any compiler.

Found once for real: six explanatory lines above a `<Scroll>` in the
native-tasks example put a paragraph about `kAXScrollToVisibleAction` at the top
of the screen. A line-oriented grep over this repo returns 1,212 candidates,
essentially all of them genuine comments inside `{}` expression containers — the
shape is only visible with an AST.

Gated to text sitting alongside element children, which is the mistake's shape.
A displayed code sample (`<code>// like this</code>`) and anything under a
code-ish tag are left alone. Zero findings across 1,216 `.tsx` files in this
repo.
