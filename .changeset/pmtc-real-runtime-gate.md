---
'@pyreon/native-compiler': patch
---

New macOS-gated check: an emit exercising every canonical primitive is
typechecked against the real iOS SDK AND the real runtime sources, with no stubs
anywhere. Every other Swift gate substitutes stubs for `PyreonRuntime`, which is
what lets them run on Linux and also what let `<Audio>` reference a type that
existed only in a stub. ~8s; skips where Xcode is absent.
