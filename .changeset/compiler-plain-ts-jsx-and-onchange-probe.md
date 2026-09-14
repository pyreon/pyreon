---
'@pyreon/compiler': patch
---

Two detector/pre-pass fixes found while covering the compiler's branches.

- Plain Mode (native backend): a `.ts` / `.mts` / `.cts` module is now parsed WITHOUT JSX, mirroring the JS pre-pass. The Rust mirror forced JSX on for every extension, so a generic arrow `<T>(x: T) => x` or an angle-bracket assertion `<number>x` made the parse fail and the module was silently treated as not-plain — its `state()` calls then reached the runtime and threw.
- `on-change-input`: the `type` probe now reads an `<input>` written with a closing tag (`<input type="checkbox" …></input>`), which arrives as a JSX opening element; it previously reported such a checkbox as text-like.
