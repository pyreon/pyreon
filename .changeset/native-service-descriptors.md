---
"@pyreon/native-compiler": minor
---

Eight plain service hooks (`useShare`, `useLinking`, `useHaptics`, `useNotifications`, `useBiometrics`, `useImagePicker`, `useFilePicker`, `useCamera`) are now described by data entries in a new `services.ts` and lowered through one generic `service` declaration, instead of a recognizer branch, a `DeclIR` variant and two emit branches each. The compiled Swift/Kotlin for every existing source is byte-identical (checked against the golden corpus); the only observable change is the exported `DeclIR` type: the kinds `share`, `linking`, `haptics`, `notifications`, `biometrics`, `image-picker`, `file-picker` and `camera` are gone, replaced by `{ kind: 'service', name, hook }`.
Upgrade: a plugin that inspects `DeclIR` by those kinds should match `{ kind: 'service' }` and read `hook` (e.g. `'useShare'`).
