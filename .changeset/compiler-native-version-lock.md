---
'@pyreon/compiler': patch
---

The native compiler binary is now locked to the exact `@pyreon/compiler` version. Its seven `@pyreon/compiler-<platform>` optional dependencies are pinned exactly instead of with a caret, and the loader checks the installed binary's version at runtime. When the binary comes from a different release (a lockfile dedupe, an override, or a native publish that lagged), Pyreon uses the JavaScript compiler and prints one `[Pyreon]` warning outside production. The output stays correct; builds are slower. Previously, a mismatched binary loaded silently. The Rust and JavaScript backends match only within one version, so it could emit different code.
