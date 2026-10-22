---
"@pyreon/native-cli": minor
---

New `pyreon-native dev --target=ios|android` command: the on-device edit loop. It watches the shared source, compiles it in memory (warnings and errors in milliseconds), and on a real change runs an incremental `xcodebuild` / `gradle installDebug`, installs on the booted simulator or emulator and relaunches the app. The native build is skipped when the emitted Swift or Kotlin is unchanged, a failed build never ends the session and is retried on the next save, and `--once` runs a single build-install-launch cycle and exits non-zero on failure (for scripts and E2E setup). It is a rebuild loop, not hot reload. Measured on the scaffolded app: about 31 s for the first iOS build, about 3 s for a warm edit-to-relaunch.
