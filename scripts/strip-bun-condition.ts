/**
 * Strip the `bun` condition from every exports entry (and nested
 * subpath exports) of a package.json `exports` field.
 *
 * **The structurally correct fix for cross-module `@pyreon/core`
 * duplication** that produced the dev-404 SSR `provide()` warning storm
 * (bokisch.com 0.24.4, the root cause #850's `ssr.noExternal` papered
 * over). Same shape as `@pyreon/head`'s 0.21.0 → 0.22.0 fix — "collapse
 * to one canonical module instance" generalised to `@pyreon/core`.
 *
 * The `bun` condition exists to point WORKSPACE consumers at TypeScript
 * source (`./src/index.ts`) for HMR, fast refresh, and type-safe
 * imports during framework development. It was never meant for published
 * consumers — Vite's `[bare]` resolver honors `bun` (→ `src/`) while
 * Vite's `[package entry]` resolver IGNORES it (→ `lib/`). Two resolver
 * paths, two different files, **two module instances** with separate
 * `_current` / `_contextStack` / `_errorBoundaryStack` state. Every
 * `provide()` outside-setup warning the consumer reported was that
 * structural duplication exposed.
 *
 * The fix at the source: published packages emit ONLY `import` (and
 * `types`) — no `bun` condition for consumers' bundlers to pick
 * inconsistently.
 *
 * Recursive: descends into subpath exports (`./ssr`, `./server`, …)
 * because every subpath has the same dual-condition shape.
 *
 * Pairs with the Symbol.for-on-globalThis hardening inside
 * `@pyreon/core` (defense-in-depth for the workspace-dev case + future
 * bundler quirks). The published-strip is the PRIMARY fix; Symbol.for
 * is the safety net.
 *
 * @example
 *   stripBunCondition({
 *     '.': { bun: './src/index.ts', import: './lib/index.js' },
 *     './ssr': { bun: './src/ssr.ts', import: './lib/ssr.js' },
 *   })
 *   // → {
 *   //   '.': { import: './lib/index.js' },
 *   //   './ssr': { import: './lib/ssr.js' },
 *   // }
 */
export function stripBunCondition(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripBunCondition)
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'bun') continue // ← the strip
      out[k] = stripBunCondition(v)
    }
    return out
  }
  return node
}

/**
 * Strip `src` from a package.json `files` field. Pairs with
 * `stripBunCondition` — once `bun` is gone from `exports`, the `src/`
 * directory is unreachable through the package name. Shipping it
 * inside the npm tarball is pure waste (50KB-2MB per package × 53
 * framework packages ≈ multi-megabytes of dead weight per install).
 *
 * Workspace `package.json`'s `files` field is restored after publish
 * via the existing Phase 2 `writeFile(pkgPath, raw)` step — workspace
 * dev still has `src/` available for source-condition resolution.
 *
 * @example
 *   stripSrcFromFiles(['lib', '!lib/**\/*.map', 'src', 'README.md'])
 *   // → ['lib', '!lib/**\/*.map', 'README.md']
 */
export function stripSrcFromFiles(files: unknown): unknown {
  if (!Array.isArray(files)) return files
  return files.filter((entry) => entry !== 'src' && entry !== './src' && entry !== 'src/**')
}
