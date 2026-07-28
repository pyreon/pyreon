---
'@pyreon/native-compiler': patch
---

Lock the platform escape hatches, because two new warnings now depend on them.

The warnings added for hooks and control-flow components with no native
lowering both tell the author to "use it behind a `<Web>` escape hatch". That
advice is only worth giving if `<Web>` genuinely excludes its children from the
native emit — and wrong guidance inside a compiler warning is worse than none,
because it sends people down a path that cannot work while looking
authoritative.

Verified before those warnings shipped rather than after: `<Web>` excludes from
both natives, `<NativeIOS>` and `<NativeAndroid>` include on their own target
only, and content OUTSIDE a hatch survives everywhere — the half an
exclusion-only test forgets, since a hatch that excluded everything would pass
it. What remains after exclusion is type-checked on both targets too, since a
dangling wrapper would satisfy every string assertion and fail on compile.
