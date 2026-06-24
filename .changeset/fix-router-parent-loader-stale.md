---
'@pyreon/router': patch
---

Fix a parameterised parent layout's `useLoaderData()` going stale across a child navigation.

PR #1833 made parent layouts persist (mount once) across child navigations so their chrome/scroll/state survives — but a NON-leaf depth never re-emitted, and `useLoaderData()` reads a plain (non-reactive) context snapshot. So a parameterised parent layout with its OWN loader (e.g. `/users/:id` whose loader fetches the user) kept showing the first user after navigating `/users/42/profile → /users/99/profile`: the parent record stays the same, the id changed 42→99, its loader re-ran and `_loaderData` updated, but the persisting layout's `useLoaderData()` stayed on user-42. (The leaf was always fine — it re-mounts. `useParams()` was also fine — it keys off the `currentRoute` signal; but loader data is depth-specific and can't fall back to a signal the same way.)

Fix: a non-leaf depth now re-emits (re-mounts, re-reading `useLoaderData()` in its body) when THIS depth's own loader data changes. Loader-LESS layouts (the common chrome/sidebar case — and the exact case #1833 fixed) keep `loaderData === undefined` on both sides, so they still mount once. A same-param child navigation (e.g. switching tabs under the same `/users/42/…`) leaves the parent data unchanged → still no re-mount.
