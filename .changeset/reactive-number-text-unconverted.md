---
'@pyreon/runtime-dom': patch
---

Reactive text bindings (`{count()}`, `{props.n}`, `{() => price()}`, an `h()` accessor child) hand a number to the DOM unconverted and compare the raw value to decide whether the text changed, as static number children already do. Converting the number with `String(n)` in JS made V8 grow its number-to-string cache to about 64 KB, which the page never gets back, once a number signal had taken more than ~200 distinct values. Each live text binding also retains about 27 B less. The rendered text is unchanged, a value whose text stays the same (`1` then `'1'`, `0` then `-0`) is still not rewritten, and hydration adopts server text that matches without rewriting it or reporting a mismatch.
