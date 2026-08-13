---
'@pyreon/hooks': patch
'@pyreon/native-compiler': patch
---

`useClipboard`'s reads were 1:1-inverted, and `text` was missing natively

Two findings, both in the same hook.

**The reads.** On the web `copied` and `text` are accessors (`copied: () => boolean`), and the hook's own documented example is
`{() => copied() ? 'Copied!' : 'Copy'}`. Natively they are stored properties, so that documented spelling failed with
`cannot call value of non-function type 'Bool'` — while the spelling that DID compile natively (`c.copied`) renders the accessor function on the web. Reads now drop their parens on both targets; a real method (`copy(text)`) keeps its parens and arguments.

This is the third instance of the class, after `model()`'s state fields and the one `useBluetooth` avoided by construction: **a hook whose web surface is accessors and whose native surface is fields needs a use-site rewrite, or the two spellings are mutually exclusive.**

**The missing member.** `text` — "the last successfully copied text" — has been in the web hook since inception and existed on neither native runtime, so a component reading it compiled on the web and failed with `has no member 'text'`. Both runtimes now expose it, set on the successful-copy path.

Found by taking each lowered hook's web-correct spelling and compiling it. Worth noting what that same sweep did NOT find: `useOnline` returns an accessor directly rather than an object, and `useCrashReporter` exposes getter-backed plain properties that already match — both were spellings I had guessed wrong, not bugs.
