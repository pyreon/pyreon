---
'@pyreon/create-multiplatform': patch
---

The Android scaffold now wires Coil (`io.coil-kt:coil-compose`) and the native CLI emits the conditional imports for `<Scroll>` (`verticalScroll`/`rememberScrollState`), `<Modal>` (`Dialog`), and remote `<Image>` (`AsyncImage`) — these primitives were stub-masked (green in the kotlinc validate loop, red on a real `gradle assembleDebug`). Now the full primitive vocabulary compiles + renders on a real Android build.
