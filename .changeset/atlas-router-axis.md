---
'@pyreon/atlas': minor
---

Add `routerPlugin` — route state as a scenario axis for components that ask the router questions.

**Sized honestly.** A component calling `useRouter()`/`useParams()` does not crash in the workbench today: Atlas already detects a missing provider and reports that the fix is an `atlas.config.ts` wrapper. So this removes hand-written boilerplate, and adds the thing a wrapper cannot give you — `/users/1` and `/users/999` as SEPARATE verified scenarios, each with its own verdict, snapshot and URL.

The URL is carried as scenario METADATA, not as an arg. In `args` it would render as a control the component does not have and let a user "edit" something with no effect.

`installRouter` builds the router from the module the loader resolved, never Atlas's own copy — `useRouter()` resolves against module-level state inside a particular copy of `@pyreon/router`, so a router made from the wrong one is invisible to the component and reports "no router" while one demonstrably exists. It clears the active router on dispose, because that state outlives the scan and would otherwise answer for whatever runs next, including a check meant to observe a component WITHOUT one.

With no URLs configured the plugin is the identity function, so it costs nothing until it is given something to vary.
