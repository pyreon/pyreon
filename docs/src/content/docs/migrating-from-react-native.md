---
title: Coming from React Native & Expo
description: A concept map for React Native and Expo developers — View/Text/Pressable to Pyreon primitives, hooks to signals, Expo Router to @pyreon/router, expo-* modules to Pyreon hooks — plus what does not carry over.
---

If you build apps with React Native or Expo, most of your instincts transfer — TypeScript, JSX, a component per screen, a router, hooks for device APIs. Three things change: **components run once** (state is signals, not re-rendering), **the native output is generated SwiftUI / Jetpack Compose** (no JavaScript engine on the device), and **the native side compiles a narrow, declarative subset** of TypeScript.

Native targets are [experimental](/docs/multiplatform); read [Pyreon vs Expo, React Native, Flutter](/docs/compare-app-frameworks) first if you are still deciding. For the web half of the same concepts see [Coming from React](/docs/migrating-from-react).

## Components and state

| React Native | Pyreon |
| --- | --- |
| `function Screen(props)` re-runs on every state change | `function Screen(props)` **runs once**; signals update only what reads them |
| `const [n, setN] = useState(0)` | `const n = signal(0)` — read `n()`, write `n.set(1)` or `n.update(v => v + 1)` |
| `useMemo(() => a * 2, [a])` | `const doubled = computed(() => a() * 2)` — dependencies are tracked, no array |
| `useEffect(() => { … }, [dep])` | `effect(() => { … })` — re-runs when the signals it reads change |
| `props.x` re-evaluated each render | `props.x` is reactive when read in JSX or an effect; **destructuring props captures once** |

```tsx
// React Native
function Counter() {
  const [n, setN] = useState(0)
  return <Pressable onPress={() => setN(n + 1)}><Text>{n}</Text></Pressable>
}

// Pyreon (native-compilable)
import { signal } from '@pyreon/reactivity'
import { Press, Text } from '@pyreon/primitives'

function Counter() {
  const n = signal(0)
  return (
    <Press onPress={() => n.set(n() + 1)}>
      <Text>{n()}</Text>
    </Press>
  )
}
```

## UI primitives

Pyreon's cross-platform vocabulary is `@pyreon/primitives` (17 semantic primitives; the [primitives page](/docs/primitives) documents each).

| React Native / Expo | Pyreon primitive |
| --- | --- |
| `View` (column) | `<Stack>` |
| `View` with `flexDirection: 'row'` | `<Inline>` |
| Absolutely positioned / overlapping views | `<Layer>` |
| `ScrollView` | `<Scroll>` |
| `Text` | `<Text>` (and `<Heading>`) |
| `Image` | `<Image>` |
| `Pressable` / `TouchableOpacity` | `<Press>` |
| `Button` | `<Button>` |
| `TextInput` | `<Field>` |
| `Switch` | `<Toggle>` |
| `Modal` | `<Modal>` |
| `FlatList` / `FlashList` | `<Scroll>` with `<For>` (native lazy lists virtualize; a 10,000-row list is device-proven) |
| `expo-av` / `expo-video` | `<Audio>`, `<Video>` |
| `react-native-webview` | `<WebView>` |
| `Animated` / `LayoutAnimation` | `<Transition>`, `<TransitionGroup>` |

Event names are one per concept: `onPress` everywhere (not `onClick` on one platform and `onPress` on another). Styling is tokens-first (`padding={4}` resolves through the theme) rather than a `StyleSheet` of pixel numbers.

## Navigation

| Expo Router / React Navigation | Pyreon |
| --- | --- |
| File-based routes in `app/` (Expo Router) | Web: file-based routing in `@pyreon/zero`. **Native: an explicit `createRouter({ routes: [...] })` array** — there is no file-based routing on the native targets |
| `useRouter().push('/users/1')` | `useNavigate()` |
| `useLocalSearchParams()` | `useParams()` |
| Loaders (Expo Router data APIs) | route `loader` + `useLoaderData()` |
| Stack / tab navigators | `RouterProvider` + `RouterView`; the [router demo](/docs/multiplatform) covers nav, typed params, guards and loaders |
| Deep links | `useLinking`; the matrix lists deep links as not yet proven for navigation |

## Device APIs: expo-* to Pyreon hooks

The compiler recognizes a fixed set of hooks. The [capability matrix](/docs/multiplatform) states, per area, how much is proven on a simulator or emulator; treat anything not listed there as unproven.

| Expo package | Pyreon hook |
| --- | --- |
| `expo-secure-store` | `useSecureStorage` |
| `@react-native-async-storage/async-storage`, `expo-sqlite` | `useStorage`, `useDatabase` |
| `expo-location` | `useGeolocation` |
| `expo-notifications` (push) | `usePush`, `useNotifications` |
| `expo-local-authentication` | `useBiometrics` |
| `expo-clipboard` | `useClipboard` |
| `expo-haptics` | `useHaptics` |
| `expo-sharing` / `Share` | `useShare` |
| `expo-image-picker`, `expo-document-picker` | `useImagePicker`, `useFilePicker` |
| `expo-linking` | `useLinking` |
| `expo-network` / NetInfo | `useNetworkStatus`, `useOnline` |
| Auth flows (`expo-auth-session`) | `useAuth` |
| `fetch`, `react-query` | `useFetch`, `useQuery` |
| WebSocket | `useWebSocket` |
| `react-native-maps` | `useMap` |
| In-app purchases | `usePayments` |
| Sentry / crash reporting | `useCrashReporter` |
| `useColorScheme`, `Dimensions` | `useColorScheme`, `useSizeClass` |

For anything not on this list, `useNativeModule('Name')` calls a Swift or Kotlin class **you** write in the app; member calls pass straight through, so the platform compiler type-checks them. That is the equivalent of writing an Expo module, not of installing one from a catalog — plan for more glue code than on Expo.

## Forms, validation, i18n

`useForm` (with `useFieldArray` for dynamic lists) and `@pyreon/validation` replace Formik / React Hook Form patterns; `createI18n` replaces i18next. All three run on the native targets; see the matrix for the proven behaviors.

## What does not carry over

- **Over-the-air updates.** There is no EAS Update equivalent: native logic is compiled. Ship fixes through the stores, or move volatile content into data or a [WebView island](/docs/multiplatform-libraries).
- **Arbitrary npm packages.** The compiler lowers your component *source*, not npm packages. A package runs on native only if it is pure reactive logic the compiler recognizes or has a native runtime — see [PMTC Library Status & Authoring](/docs/multiplatform-libraries).
- **Arbitrary JavaScript.** Outside the declarative subset (signals, typed props, the primitives, `<For>`/`<Show>`, the supported hooks) the compiler emits a *named* warning. Check output with the native CLI's `check` command during development.
- **Fast Refresh on native.** Web has hot reload; native changes rebuild the app.
- **Reanimated / Skia.** Animation on native is the platform's own, via `<Transition>`; there is no worklet or canvas-drawing equivalent.

## A migration path that works

1. Move your **business logic** (state, derived values, validation, data fetching) into plain TypeScript with signals — it is shared by web and native as-is.
2. Rebuild **screens** with `@pyreon/primitives`, one at a time, using the table above.
3. Replace each `expo-*` call with its Pyreon hook; for the rest, write a `useNativeModule` bridge.
4. Run the native CLI `check` command to see every construct the compiler cannot lower, and fix those by name.
5. Keep your web app on `@pyreon/zero`; it shares the same components and state.

Start from `npx create-multiplatform my-app` — see [`@pyreon/create-multiplatform`](/docs/create-multiplatform).
