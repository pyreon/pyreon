---
'@pyreon/core': minor
'@pyreon/flow': minor
'@pyreon/code': minor
'@pyreon/charts': minor
'@pyreon/zero': minor
'@pyreon/hooks': patch
'@pyreon/native-compiler': minor
---

The framework-wide colour mode now reaches the rest of the framework.

- **`@pyreon/core`:** `useProvidedColorMode()` returns the mode an app explicitly set (`<PyreonUI mode>` / `<ColorModeProvider mode>`), or `undefined` when none did. It is for components whose own default is not "follow the system", so adopting the shared mode never flips them on a page that never asked.
- **`@pyreon/flow`:** with no `colorMode`, a flow takes the app's colour mode, and is still light when the app set none. An explicit `colorMode` still wins.
- **`@pyreon/code`:** an editor created without a `theme` follows the app's colour mode once mounted in `<CodeEditor>`, live. An explicit `theme` still wins, and with no app mode the default is still light.
- **`@pyreon/charts`:** `<OptionChart>` follows a mode the app set. With none, it keeps ECharts' own light look, and it still ignores the bare OS scheme, as ECharts does.
- **`@pyreon/zero`:** the theme now also declares the CSS `color-scheme` on `<html>`, beside `data-theme`, in `setTheme`, on setup and in the pre-paint script. Native form controls and scrollbars follow it, and so does the shared colour mode, so a zero theme toggle reaches charts, flow and the code editor with no wiring. **`themeScriptCspHash` changed with the script:** an app that pinned the old hash in its own `Content-Security-Policy` header must take the new value.
- **`@pyreon/native-compiler`:** `useColorMode()` lowers to the platform scheme read, exactly as `useColorScheme()` does.
- **`@pyreon/hooks`:** `useColorScheme()`'s docs point to `useColorMode()` for theming; it reads the OS only.
