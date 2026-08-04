---
'@pyreon/loom': minor
'@pyreon/config': minor
---

`@pyreon/loom` reads its settings from the ecosystem-wide `pyreon.config.*`,
and `@pyreon/config` gains the `loom` section that describes them.

```ts
export default defineConfig({
  loom: {
    devPaths: ['src/manifest.ts', '**/*.gen.ts'],
    ignore: [{ dep: 'sharp', code: 'unused-dep', reason: 'loaded by the image plugin' }],
    strict: true,
    severity: { 'unused-dep': 'info', 'phantom-dep': 'error' },
  },
})
```

Two homes, one shape. The root `package.json`'s `loom` key predates the shared
file, still works, and wins **per key** — mirroring how `atlas.config.*` beats
`pyreon.config.*`. Per-key rather than whole-object so a project mid-migration
can move one setting at a time without the manifest silently blanking
everything it does not mention.

Both homes go through ONE validator. Two would let one home accept what the
other rejects — a config that works until you move it.

`severity` is the adoption lever: raise a code to `error` once it is clean,
lower one to `info` while it is being burned down, the same ratchet this repo
runs its lint backlogs on. An unknown code is rejected **with the list of real
ones**, and severity is applied BEFORE suppressions so an explicit `ignore`
still has the last word — a deliberate wave-through should not be resurrected
by a blanket raise.

A config file that exists but cannot be loaded is a NAMED error, never a silent
skip. `loom scan` has no bundler (vite is an optional peer used only by
`loom dev`), so a TypeScript config needs a runtime that strips types — the
message says so and points at `pyreon.config.mjs` or the manifest key.

Bisect-verified: flip the precedence → the per-key spec fails; apply severity
after suppressions → the ignore-wins spec fails. Suite 119/119.
