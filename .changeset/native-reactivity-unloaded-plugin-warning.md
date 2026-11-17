---
'@pyreon/native-compiler': patch
---

A compile without `@pyreon/reactivity`'s native plugin now names the missing plugin when a file imports `signal` or `computed` from `@pyreon/reactivity`. It used to print two warnings that read as if the import were wrong ("`signal` is imported here as `signal` from `@pyreon/reactivity`, not as the `signal` hook"), though that import is the documented one. The new warning is one line per package, says the plugin is not loaded, and gives the fix: declare `@pyreon/reactivity` in the app's dependencies or pass its plugin to `createCompiler({ plugins })`. The native CLI loads the plugin, so `pyreon-native check` is unchanged.
