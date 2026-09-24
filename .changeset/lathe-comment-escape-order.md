---
'@pyreon/lathe': patch
---

fix(lathe): a spec description could inject executable code into every generated file

`safeBlockComment` broke the `*/` terminator FIRST and stripped control
characters SECOND, so a control character sitting between the `*` and the `/`
hid the terminator from `split` — and the strip then re-joined it:

```
in   A book *<NUL>/ globalThis.PWNED = 1; /*
out  A book */ globalThis.PWNED = 1; /*

/** A book */ globalThis.PWNED = 1; /* */
export const Book = 1
```

That is valid JavaScript with an injected statement at code position, in every
generated file, executing on import — and because the output parses, nothing
downstream flags it. Reachable from an OpenAPI `summary` or `description`.

The order is now removal-before-break, which is the general form of the repo's
"escape the escape character first" rule: a step that REMOVES characters must
precede a step that BREAKS a multi-character terminator. `safeLineComment`
already had these two in the correct order.

The regression test runs the emitted block rather than inspecting it — a
string assertion passes on output that merely looks right.
