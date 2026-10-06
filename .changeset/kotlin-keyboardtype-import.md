---
"@pyreon/native-cli": patch
---

The Kotlin build now imports `androidx.compose.ui.text.input.KeyboardType` when a `<Field kind="number|email|tel|url|search">` emits `KeyboardOptions(keyboardType = KeyboardType.…)`. The header imported only `ImeAction` from that package, so a real Compose compile failed with `Unresolved reference 'KeyboardType'` (the kotlinc stub gate cannot see a missing import).
