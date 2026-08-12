---
'@pyreon/vite-plugin': minor
'@pyreon/zero': minor
'@pyreon/loom': patch
---

zero's nested SSR/SSG build now inherits the user's `pyreon()` transform options

`mode: 'ssg' | 'ssr' | 'isr'` runs a nested Vite build over the same source. It
cannot forward the outer `pyreon` plugin instance — a second `configResolved`
rewrites captured output paths — so it constructs a fresh one, and that call was
a bare `pyreon()`. Every transform option applied to the client graph and
silently did not apply to the SSR graph.

`ssrTemplate` was the sharpest case: it shapes only the SSR emit, so the SSR pass
is the one place it does anything, and the one place it was dropped.
`pyreon({ ssrTemplate: false })` in an SSG app was a no-op — `@pyreon/loom`'s
static-site build hit this and carried a comment saying so.

The plugin now publishes its options on its Vite `api` field
(`PyreonPluginApi`), and zero carries the transform-shaping subset across:
`compat`, `ssrTemplate`, `islands`, `jsxAutoImport`, `compileValidators`,
`optimizeValidators`.

Deliberately withheld, because forwarding them would mis-steer the sub-build:
`ssr.entry` (its `config()` return sets `build.rollupOptions.input`, which beats
the inline `build({ … })` argument — it would compile the user's server entry
instead of the synthetic one zero wrote), `collapse` (client-graph-only, and it
spawns its own nested build), and `lpih` / `devErrorPrinter` (dev-server-only).

The split is typed as a total `Record` over `keyof Required<PyreonPluginOptions>`,
so a newly added option is a typecheck error until it is classified rather than
silently inheriting the wrong default.
