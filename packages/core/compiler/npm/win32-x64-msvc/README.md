# @pyreon/compiler-win32-x64-msvc

Prebuilt native binary for [`@pyreon/compiler`](https://www.npmjs.com/package/@pyreon/compiler) on Windows x64 (MSVC toolchain).

This package contains only the platform-specific `.node` binary. It is resolved automatically as an `optionalDependency` of `@pyreon/compiler` when you install on a matching platform — you should not depend on it directly.

If installation skips this package (wrong platform, network failure, etc.), `@pyreon/compiler` falls back to its pure-JS implementation. Same correctness, ~3.7-8.9× slower JSX transform.

For build instructions and platform support, see the [`@pyreon/compiler` README](https://github.com/pyreon/pyreon/tree/main/packages/core/compiler).
