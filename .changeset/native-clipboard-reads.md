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

## The Swift stubs were narrower than the runtimes

Sweeping every lowered hook's web-correct spelling through the compiler
surfaced a second class: the **type gate was rejecting correct emits**,
because several Swift stubs carried a fraction of their runtime's surface.

- `PyreonShare` — stub had `url`; the runtime has `text` / `url` / `textUrl` / `canShare`
- `PyreonHaptics` — stub had `impact`; the runtime has three
- `PyreonNotifications` — stub had `notify`; the runtime also has `requestPermission`

Every one of those members is reachable from the web hook, so a component
using them compiled on the web and was refused here. This is the mirror of
the documented superset-stub trap and just as costly: a stub NARROWER than
reality fails working code.

`useBiometrics.isAvailable` was the one real product gap in the sweep — it
has been in the web hook since inception and existed on neither runtime.
Swift now answers it with `canEvaluatePolicy` (honest: no sensor or no
enrolment reports false); Kotlin returns `false` alongside its v1
`authenticate` scaffold, because a hardcoded `true` would send a caller down
a path that cannot authenticate.

A new suite compiles the web-correct spelling of each lowered hook's surface,
so this class cannot recur silently.
