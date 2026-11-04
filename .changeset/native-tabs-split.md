---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/native-router-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Add top-level navigation primitives: `<Tabs>` / `<Tab>` and `<Split>` (#3983).

`<Tabs value onChange>` with literal `<Tab value label icon>` entries is a tab bar that keeps every visited tab mounted, so a tab's local state, typed text and scroll position survive switching away and back. On the web it is the WAI-ARIA tabs pattern (tablist, roving tabindex, arrow keys / Home / End) as a bottom bar below 600px and a side rail at 600px and wider. On iOS it lowers to `TabView(selection:)`, using the iOS 18 `Tab` API with `.sidebarAdaptable` where available. On Android it lowers to Material `BottomNavigation` below 600dp of window width and `NavigationRail` at 600dp and wider, the `useSizeClass()` breakpoint. A selection signal typed by a string-literal union lowers to the native enum.

`<Split sidebar showDetail onBack>` is a list/detail layout: two panes on a wide window, one pane on a narrow one. On iOS that is `NavigationSplitView`, or on a compact width the detail pushed onto a navigation stack. Inside a `RouterProvider` it reuses the router's stack rather than nesting a second one. On Android, `BackHandler` routes the system back gesture to `onBack`.

Both primitives are router-agnostic, like `<Link>`: the selection and the visible pane are your signals. The native tab bar is built at compile time, so a `<Tab>` produced by `<For>`, or one with a computed `value`, is dropped with a named warning.
