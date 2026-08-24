---
'@pyreon/native-compiler': patch
---

The native-coverage gate now proves a package's emit COMPILES

It judged a package by transform WARNINGS and never compiled anything, so a
warning-free uncompilable emit read as "crosses". Compiling every registry
snippet on real toolchains found 9 Swift and 5 Kotlin failures — all invisible.

Two checks close that:

- **A verbatim-symbol detector, no toolchain required**, so it runs on every
  `validate-fast`. If a symbol the snippet imported reappears in the emit as a
  free call, the frontend declined silently and the emitted code names a
  function that exists on neither target. Symbols the package's own native
  co-source declares are exempt (`PyreonCrdtDoc` is deliberately the same name
  in TS, Swift and Kotlin), checked against the shipped source rather than a
  name convention.

- **An opt-in compile pass** (`PYREON_COVERAGE_COMPILE=1`), wired into the macOS
  CI job that already owns the toolchain. Too slow for `validate-fast`, free
  where swiftc already lives.

Six registry snippets were wrong and are corrected. None of the packages was
broken: `createMachine` / `createI18n` / `syncedSignal` lower only inside a
component body and were declared at module scope; `model('user', {…})` and
`syncedSignal({key, initial})` are phantom APIs that would fail on the web too;
`rocketstyle(Element)` and `attrs(Element)(…)` skip the curry and the options
object their runtimes take.

Also extends the Swift stubs with `background` and `PyreonSizedMap` — both
NARROWER than the shipped runtime, which manufactures false failures exactly as
a wider stub hides real ones.

Every crossing package's emit now compiles, and the known-uncompilable ratchet
is empty.
