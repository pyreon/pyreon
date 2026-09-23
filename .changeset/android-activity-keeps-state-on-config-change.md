---
'@pyreon/create-multiplatform': patch
---

Scaffolded Android apps no longer lose their state when the device rotates or switches to dark mode. The generated `MainActivity` now declares `android:configChanges` for rotation, screen size and layout, UI mode and keyboard changes, which is the React Native default set. Before, Android destroyed and recreated the activity on each of those changes, so every signal in the compiled app went back to its initial value. Compose now recomposes in place.

Existing projects can get the fix by adding the same attribute to the launcher `<activity>` in `android/app/src/main/AndroidManifest.xml`:

    android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode"
