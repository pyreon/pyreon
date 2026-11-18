---
'@pyreon/router': minor
'@pyreon/native-compiler': minor
'@pyreon/primitives': patch
'@pyreon/compiler': patch
'@pyreon/cli': patch
---

Per-tab back stacks are a value the app imports, so the tab engine (stacks, history stamps, tab planning) is bundled only by apps that use tabs: about 440–480 B gzipped off the initial JS of every routed app without tabs (measured on hn-clone, ui-showcase and collab-board).

Breaking (`@pyreon/router`): `createRouter({ tabs: [...] })` is now `createRouter({ tabs: routerTabs([...]) })`, with `routerTabs` exported from `@pyreon/router`. The tabs themselves (`{ name, root }`) and every router method (`activeTab`, `selectTab`, `tabStack`, `withTab`) are unchanged. A plain array throws at `createRouter` with the fix in the message.

Breaking (`@pyreon/native-compiler`): PMTC lowers `tabs: routerTabs([...])` exactly as it lowered the array before; a bare array is now refused with a warning naming the fix, matching the web router.

`@pyreon/primitives` (`<Tabs router>` dev warning), `@pyreon/compiler` (the `selectTab` diagnose fix) and the `@pyreon/router` docs show the new form.

Upgrade: codemod router-tabs-function
