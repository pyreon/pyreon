---
title: Native E2E Testing with Maestro
description: Test a Pyreon iOS and Android app end to end with Maestro — one YAML flow, the same id selectors on both platforms, wired into pyreon-native dev. What the scaffold sets up, how to retrofit an existing app, and what has and has not been verified.
---

[Maestro](https://maestro.dev) drives a running app through the platform accessibility tree and takes its tests as YAML. It suits a PMTC app well: the app is real SwiftUI and Compose, so Maestro sees real native views, and a single flow can run on both platforms.

## What the scaffold gives you

A project from [Create Multi-Platform](/docs/create-multiplatform) comes ready for this:

- `data-testid` on the sample app's elements. PMTC lowers it to the iOS **accessibility identifier** and the Android **test tag**.
- `MainActivity` exposes test tags as Android resource ids (`testTagsAsResourceId`). Without that, Compose keeps test tags private to its own test rules and Maestro's `id:` finds nothing on Android.
- `MainActivity` pads for the system bars. On Android 15 and later an app draws edge-to-edge, so the top of the screen otherwise sits under the status bar and is hidden from the accessibility tree.
- `.maestro/counter.yaml`, one flow for both platforms.
- `e2e:ios` and `e2e:android` scripts.

```yaml
# .maestro/counter.yaml
appId: com.example.MyApp
---
- launchApp:
    clearState: true
- assertVisible:
    id: count
    text: "0"
- tapOn:
    id: increment
- tapOn:
    id: increment
- assertVisible:
    id: count
    text: "2"
```

The `appId` is the iOS bundle id and the Android application id; the scaffold keeps them identical, so one value serves both.

## Run it

Install Maestro (it needs a Java 17 or newer runtime):

```bash
brew install mobile-dev-inc/tap/maestro
```

Start a simulator or emulator, then:

```bash
bun run e2e:ios        # pyreon-native dev --target=ios --once && maestro test .maestro
bun run e2e:android    # pyreon-native dev --target=android --once && maestro test .maestro
```

`pyreon-native dev --once` builds, installs and launches the app, and exits non-zero if any step fails, so the flows never run against a stale or missing build (see [Native Dev Loop](/docs/native-dev-loop)). With several devices connected, pick one with `maestro --device <id> test .maestro`.

## Give elements an id

Put `data-testid` on anything a flow needs to find:

```tsx
<Text data-testid="balance">{balance}</Text>
<Button data-testid="send" onPress={send}>Send</Button>
```

Then select by `id:` in the flow. Prefer ids over visible text: text changes with copy and translation, ids do not.

## Retrofit an existing Android app

An app created before the scaffold carried these changes needs the same three adjustments in `MainActivity.kt`:

```kotlin
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId

@OptIn(ExperimentalComposeUiApi::class)
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            Box(Modifier.safeDrawingPadding().semantics { testTagsAsResourceId = true }) {
                App()
            }
        }
    }
}
```

iOS needs nothing: the accessibility identifier is already set from `data-testid`.

## What has been verified

The scaffolded flow was run with Maestro 2.11.0 on an iPhone 16 simulator (iOS 18.5) and an Android API 35 emulator, and passes on both with identical selectors. A flow asserting the wrong count fails, so the assertions discriminate.

It was **not** verified on CI runners, on physical devices, or on Maestro Cloud, and only the counter flow was exercised. Flows that use navigation, text input, scrolling or device permissions are yours to confirm on both platforms before relying on them; treat a platform difference as a finding to report rather than something to paper over in the flow.

## How this relates to the repository's own device tests

Pyreon's own CI proves the compiler against real devices with XCUITest and Compose tests that live next to each example. Those exist to verify the framework. Maestro is the tool for verifying **your app**: it needs no Xcode test target and no Android instrumentation module, and the same flow runs on both platforms.
