---
'@pyreon/compiler': patch
---

The native-binary loader now finds an in-tree `native/pyreon-compiler.node` from the built entry as well as from source. The build code-splits the JSX transform into `lib/_chunks/`, two levels below the package root, but the loader only probed one level up. So anything that loaded the compiler's built `lib/` from a source checkout silently ran the slower JS backend. Published installs don't ship `native/`, so they're unaffected and keep resolving the per-platform `@pyreon/compiler-<platform>` package.
