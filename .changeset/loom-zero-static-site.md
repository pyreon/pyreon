---
'@pyreon/loom': minor
---

`loom build` prerenders the observatory to a standalone static site — one page per view, deployable to any static host or openable from disk.

The observatory is now a `@pyreon/zero` app, so the five views are real fs-routes (`/`, `/matrix`, `/cycles`, `/impact`, `/manifests`) instead of a `view` signal. Until now there was no way to send someone a link to the cycles view; now every view has a URL, its own prerendered page, and its own chunk. The view tabs render as real links when the host supplies `hrefFor`, and `mountObservatory` is unchanged — both new `<Observatory>` props are optional and default to today's behaviour.

`@pyreon/zero`, `head`, `router`, `runtime-server` and `server` join `vite` and `@pyreon/vite-plugin` as OPTIONAL peers: the app root has to resolve zero's own graph (bun's isolated layout does not expose it transitively), but `loom scan` — the CI gate and the command most people run — still needs none of them, and `loom build` names the whole set when they are absent.
