---
"@pyreon/create-multiplatform": minor
---

The scaffold is now ready for on-device end-to-end testing with Maestro: the sample app carries `data-testid` values, a `.maestro/counter.yaml` flow runs unchanged on iOS and Android, and `e2e:ios` / `e2e:android` scripts build and launch the app (`pyreon-native dev --once`) before running the flows. `MainActivity` now exposes test tags as Android resource ids (without it, `id:` selectors match nothing on Android) and pads for the system bars (on Android 15+ the top of the screen otherwise sits under the status bar). Verified by running the flow with Maestro on an iOS 18.5 simulator and an API 35 emulator. The scripts need a `@pyreon/native-cli` that ships `dev`, so they work from the release that contains this change.
