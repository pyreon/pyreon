---
'@pyreon/hooks': minor
'@pyreon/create-multiplatform': patch
---

`useBiometrics` on Android now shows a real BiometricPrompt. Before, the Android runtime returned false from `authenticate` and `isAvailable` whatever the device could do. It now checks `BiometricManager` for an enrolled strong biometric and resolves true only when the user authenticates.

Breaking for existing Android apps: the build needs `implementation("androidx.biometric:biometric:1.1.0")`, and for the prompt to show, `MainActivity` must extend `androidx.fragment.app.FragmentActivity` (a `ComponentActivity` subclass). New apps from `create-multiplatform` get both.
