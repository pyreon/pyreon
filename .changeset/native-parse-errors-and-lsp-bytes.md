---
'@pyreon/native-compiler': patch
'@pyreon/native-cli': patch
---

Fix two silent failures in the native toolchain: a syntax error passing `check`, and the LSP dropping any non-ASCII document.

**A file that does not parse no longer lowers to nothing.** `parseSync` reports
syntax errors in `ast.errors` and PMTC ignored that array, so an unparseable
file produced an EMPTY program that every pass below walked without complaint —
`transform` returned `{ code: '', warnings: [] }`, a *successful* result. Empty
output is legitimate for other reasons (a types-only module, a re-export
barrel), so nothing downstream could tell "there was nothing to emit" from
"this is not TypeScript", and both tools reported success: `pyreon-native
check` exited 0 on a file with a syntax error, and `pyreon-native build` wrote
an empty `.swift`/`.kt` and exited 0, so the failure surfaced later as a
missing symbol in Xcode or Gradle with nothing pointing back at the file.
Parse errors now throw as `file:line:col: message` — the form `extractPosition`
already parses — so `check` records an error finding and exits 2.

`EmitOptions` gains an optional `filename`, used only in diagnostics; without
it the message named the compiler's in-memory default (`input.tsx`), a path
that does not exist.

**The LSP server no longer drops documents containing non-ASCII characters.**
Its stdio frame parser accumulated a string and compared `buffer.length` —
UTF-16 code units — against `Content-Length`, which is a count of BYTES. Any
multi-byte character made the two disagree, the body slice came up short,
`JSON.parse` threw into a catch that swallows malformed frames, and the
document was dropped with no error. In practice diagnostics stopped working
for any file containing an accent, a curly quote or an emoji. The parser now
buffers bytes and decodes once a whole body is in hand.
