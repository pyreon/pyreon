---
"@pyreon/primitives": patch
"@pyreon/mcp": patch
---

`@pyreon/primitives` now has a manifest, so the 15 canonical multiplatform primitives (Stack/Inline/Layer/Scroll/Spacer/Text/Heading/Image/Icon/Button/Press/Link/Field/Toggle/Modal) plus `<WebView>` and the `<Web>`/`<NativeIOS>`/`<NativeAndroid>` escape hatches are queryable via the MCP `get_api` tool (and appear in `llms.txt` / `llms-full.txt`). Each entry documents the real props, the per-target mapping (DOM / SwiftUI / Compose), and the native gotchas (e.g. `<Inline>` is a non-wrapping `Row` on Android, `onPress`/`onChangeText` canonical handlers). This is the AI-facing primitive reference for building multiplatform apps one-shot; pair it with `get_pattern({ name: "multiplatform" })`.
