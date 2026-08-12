---
"@pyreon/hooks": minor
"@pyreon/native-runtime-swift": minor
"@pyreon/native-runtime-kotlin": minor
---

Co-locate the @pyreon/hooks native runtimes (Batch 3).

Moves 21 hook service runtimes (AppState, Auth, Biometrics, Clipboard,
CrashReporter, Database, Fetch, FilePicker, Geolocation, Haptics, ImagePicker,
Linking, MapState, NetworkStatus, Notifications, Payments, PushNotifications,
Share, VideoPlayer, WebSocket, WebView + their Android/OkHttp variants — 28
Kotlin, 21 Swift files) out of the monolith into @pyreon/hooks/native, using the
per-service-group gate from the storage batch: 20 kotlinServices groups (each
under its own --service stub bundle; the 6 hooks with base dependencies —
Auth→PyreonHttp, CrashReporter→StorageBackends+Json, Database/Fetch/WebView→Json,
Geolocation→StorageBackends — reference the retained monolith primitives via
@base/ companions). WebView's Kotlin is device-only (android.webkit was never
stub-covered in the monolith).

The monolith now holds ONLY the framework-base runtimes (Reactivity, Tokens,
ViewModifier, Json, Assets, Http/OkHttp, StorageBackends). All 10 native example
apps gain the @pyreon/hooks/native source root.

Follow-up: the monolith's Swift hook-logic tests are removed here (the Kotlin
tests moved with their runtimes and run in the co-source gate; the Swift side is
typecheck + device-verified) — relocating them as co-located @main programs is a
tracked follow-up.
