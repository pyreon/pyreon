---
'@pyreon/runtime-dom': patch
---

A static number child (`<td>{row.id}</td>`, `{props.n}` from a plain prop, an `h()` number child) is handed to the DOM as a number again, so the browser converts it. Since #4560 the compiled setters called `String(n)` first, which makes V8 grow its number-to-string cache to about 64 KB that the page never gets back. The text is unchanged.
