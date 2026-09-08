---
'@pyreon/runtime-dom': patch
'@pyreon/reactivity': patch
'@pyreon/compiler': patch
'@pyreon/router': patch
'@pyreon/core': patch
---

Close five correctness holes on the compiled path and the redirect boundary, two of them security-relevant.

**The compiled template path skipped `setStaticProp` branches it never re-stated.** The compiler routes each attribute by name straight to `_setAttr` / `_setValue` / `_setStyle`, so every branch `setStaticProp` runs *above* that dispatch point is one the compiled path skips. Three shipped that way: `_setAttr` had no URL guard, so a compiled `<a href={u}>` wrote `javascript:alert(1)` while `h()` dropped it and SSR omitted it (an XSS in every compiled app, and a hydration mismatch); `_setValue` had no nullish branch, so `<input value={undefined}>` displayed the literal text `undefined`; and `_setStyle` cleared an object style on a nullish flip but never a string one. The shared branch is now one predicate both paths call, locked by a differential test over {attribute} × {payload} × {compiled, `h()`, SSR}.

**A namespaced JSX attribute reached every template name-reader as the empty string.** `xlink:href` parses as `JSXNamespacedName`, and the readers test for `JSXIdentifier`. Neither backend errored: the JS backend baked malformed HTML (`<use ="/static">`), the Rust backend dropped the attribute — so `<use xlink:href="#icon">`, the SVG sprite idiom, rendered nothing in every compiled app, differently per backend, for static and dynamic values alike. Both backends now bail the element to `h()`, where the runtime sets the qualified name and guards it.

**`\` is an authority delimiter, so blocking only `//host` left three bypasses.** The URL parser resolves `\\evil.com`, `/\evil.com` and `\/evil.com` off-origin exactly as `//evil.com` does, but the router's redirect boundary — whose verdict is emitted as a raw `Location:` header — classified all three as internal. Fixed as the class (any leading run of two or more `[/\]`), in the redirect boundary and in `classifyHref`, where an `internal` verdict renders a real `href` that a ctrl-click resolves without ever reaching the click handler. A blocked target now says so in dev instead of silently landing on `/`.

**A subscriber could be skipped when the tier promoted mid-notify.** `createSelector`'s `notifyBucket` snapshotted both inline subscribers, then asked whether the second was still subscribed using an identity compare against the inline tiers only — so when the first registered a third subscriber and `addSubscriber` promoted both slots into a Set, the second matched neither and was silently dropped. The check now covers every shape the two-tier store can be in.

Also: the hydration adoption marker is removed on final dispose, and the fuzz gate's timeout is derived from its seed count so the documented high-seed command can finish.
