---
'@pyreon/router': minor
'@pyreon/compiler': minor
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/native-router-swift': minor
'@pyreon/native-router-kotlin': minor
'@pyreon/native-runtime-kotlin': minor
---

Add per-tab back stacks for tab-bar apps: `createRouter({ tabs })` with `<Tabs router={router}>` (#4060).

`createRouter({ routes, tabs: [{ name, root }] })` keeps one stack per tab and an active tab. `push` / `replace` / `useNavigate()` act on the active tab. A path under another tab's root selects that tab and pushes onto it, a tab's root path selects it and pops it to the root, and `router.selectTab(name)` switches tabs and keeps every stack. Selecting the tab that is already active pops it to its root. `router.activeTab()` (reactive) and `router.tabStack(name)` read the state.

`<Tabs router={router}>` from `@pyreon/primitives` binds the tab bar to the router. Put a `<RouterView />` in each `<Tab>`: it shows that tab's top entry, and `useRoute()` / `useParams()` inside it read that tab's route, so a hidden tab keeps its page, params and loader data while another tab navigates. Tapping the active tab pops it to its root.

- **Web:** the URL is the active tab's top entry. Every history entry the router writes is stamped with its tab and that tab's stack, so Back and Forward restore both through the full navigation pipeline (guards, blockers, loaders). A reload restores the stack stamped on the current entry.
- **iOS:** `RouterProvider` adds no stack of its own for a tab-bar router. Each tab is its own `NavigationStack` inside the `TabView` (`PyreonRouterTabs` / `PyreonTabStack`), so a push from inside a tab stays in it and the tab bar stays visible.
- **Android:** each tab keeps its own stack (`PyreonTabStack`). The system Back pops the active tab first, then returns from another tab's root to the first tab. `PyreonTabs` gains an `onReselect` callback.
- **Deep links** select the tab whose root prefixes the path and push it there, on all three targets.

The native compiler lowers `tabs` (an array literal of string-literal `{ name, root }`). A `<Tab value>` that names no configured tab, a tab whose root matches no top-level literal route, and a `<RouterView />` outside a `<Tab>` are named in warnings. A signal-bound `<Tabs value onChange>` is unchanged.

`pyreon doctor diagnose` / MCP `diagnose` explain the two router-tab warnings (`selectTab` of an unknown tab, `<Tabs router>` on a router without `tabs`).
