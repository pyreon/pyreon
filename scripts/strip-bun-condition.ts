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
 * **Only valid for a package that BUILDS TO `lib/`** — gate every call
 * on `packageBuildsToLib(pkg)`. A source-shipping package (the two
 * Kotlin runtimes) has `src/` as its product, not as dead weight; see
 * that helper's JSDoc.
 *
 * @example
 *   stripSrcFromFiles(['lib', '!lib/**\/*.map', 'src', 'README.md'])
 *   // → ['lib', '!lib/**\/*.map', 'README.md']
 */
export function stripSrcFromFiles(files: unknown): unknown {
  if (!Array.isArray(files)) return files
  return files.filter((entry) => entry !== 'src' && entry !== './src' && entry !== 'src/**')
}

/**
 * Does this package's PUBLISHED JavaScript entry surface live in `lib/`?
 *
 * This is the discriminator for `stripSrcFromFiles`, and it exists
 * because "every published package builds to `lib/`" is false. Two
 * packages — `@pyreon/native-runtime-kotlin` and
 * `@pyreon/native-router-kotlin` — SHIP SOURCE: they have no `main`, no
 * `exports`, and no JavaScript at all. A scaffolded Android app adds
 * `node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin` as a
 * Gradle `srcDir` (see `create-multiplatform`'s `build.gradle.kts`
 * template), so `src/` IS the product. Stripping it left a 3-file
 * tarball (`package.json` + README + LICENSE) and an Android build that
 * cannot resolve a single Pyreon symbol.
 *
 * The Swift twins escape the same strip only by accident — SwiftPM's
 * convention names the directory `Sources`, which `stripSrcFromFiles`
 * does not match. That accident is exactly why the discriminator has to
 * be a positive statement about the package rather than a list of
 * directory names to avoid.
 *
 * "Builds to `lib/`" is the honest question because it is the one the
 * strip's own rationale depends on: `src/` is dead weight precisely
 * WHEN `lib/` is the reachable entry (post-`stripBunCondition`, the
 * `bun` → `./src/*.ts` condition is gone, so nothing can reach `src/`
 * through the package name). A package with no JS entry has nothing to
 * become unreachable, so the premise does not hold and `src/` stays.
 *
 * Deliberately NOT keyed on the `pyreon.native` marker or the absence of
 * a `build` script: several `lib/`-building packages also carry
 * `pyreon.native`, and a package's build script says nothing about what
 * it publishes.
 *
 * @example
 *   packageBuildsToLib({ exports: { '.': { import: './lib/index.js' } } }) // true
 *   packageBuildsToLib({ main: './lib/index.js' })                        // true
 *   packageBuildsToLib({ files: ['src'] })                                // false
 */
export function packageBuildsToLib(pkg: {
  main?: unknown
  module?: unknown
  exports?: unknown
  bin?: unknown
}): boolean {
  const refsLib = (node: unknown): boolean => {
    if (typeof node === 'string') return node.replace(/^\.\//, '').startsWith('lib/')
    if (Array.isArray(node)) return node.some(refsLib)
    if (node && typeof node === 'object') return Object.values(node).some(refsLib)
    return false
  }
  return refsLib(pkg.main) || refsLib(pkg.module) || refsLib(pkg.exports) || refsLib(pkg.bin)
}

/**
 * The `files` array a package will actually be PUBLISHED with, after
 * `scripts/publish.ts` rewrites the manifest. Single source of truth for
 * "what does the tarball contain" — `publish.ts` applies this transform
 * and `check-distribution.ts` gates against it, so the gate cannot
 * describe a tarball publish does not produce.
 */
export function publishedFiles(pkg: {
  files?: unknown
  main?: unknown
  module?: unknown
  exports?: unknown
  bin?: unknown
}): string[] {
  const files = Array.isArray(pkg.files) ? (pkg.files as unknown[]).map(String) : []
  if (!packageBuildsToLib(pkg)) return files
  return (stripSrcFromFiles(files) as unknown[]).map(String)
}

/**
 * Paths a package NEEDS in its tarball: every co-located native source
 * directory it declares via `pyreon.native` (consumed by SwiftPM /
 * Gradle straight out of `node_modules`), plus every JS entry point its
 * `main` / `module` / `exports` / `bin` names.
 */
export function requiredPublishPaths(pkg: Record<string, unknown>): string[] {
  const out: string[] = []

  const native = (pkg.pyreon as { native?: unknown } | undefined)?.native
  if (native && typeof native === 'object') {
    for (const field of ['swift', 'kotlin'] as const) {
      const raw = (native as Record<string, unknown>)[field]
      if (raw === undefined) continue
      for (const e of Array.isArray(raw) ? raw : [raw]) {
        if (typeof e === 'string') out.push(e)
        else if (e && typeof e === 'object' && typeof (e as { dir?: unknown }).dir === 'string') {
          out.push((e as { dir: string }).dir)
        }
      }
    }
  }

  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node.startsWith('./') || node.startsWith('src/') || node.startsWith('lib/')) out.push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node && typeof node === 'object') Object.values(node).forEach(walk)
  }
  // `bun` is stripped from `exports` at publish time, so its `./src/*.ts`
  // targets are deliberately NOT a requirement — only what survives is.
  walk(stripBunCondition(pkg.exports))
  walk(pkg.main)
  walk(pkg.module)
  walk(pkg.bin)

  return out
}

/**
 * Which required paths would be ORPHANED by the publish-time manifest
 * rewrite — present in the workspace `files` array, needed by the
 * package, and gone from the published one.
 *
 * This is the shape that shipped a broken tarball: the Kotlin runtimes
 * declare `files: ["src", …]` and `pyreon.native.kotlin.dir =
 * "src/main/kotlin"`, and `stripSrcFromFiles` removed `src` from every
 * non-private package unconditionally — so the published tarball held
 * three files and a scaffolded Android app could not resolve a single
 * Pyreon symbol from its Gradle `srcDir`. The workspace manifest was
 * correct at every point; only the PUBLISHED one was broken, which is
 * why a gate reading `files` verbatim could never see it.
 *
 * Gate against this, not against the workspace manifest: a distribution
 * gate must model what publish actually ships.
 */
export function orphanedByPublishStrip(pkg: Record<string, unknown>): string[] {
  const workspace = Array.isArray(pkg.files) ? (pkg.files as unknown[]).map(String) : []
  if (workspace.length === 0) return []
  const published = publishedFiles(pkg as Parameters<typeof publishedFiles>[0])

  const coveredBy = (entries: string[], path: string): boolean => {
    const p = path.replace(/^\.\//, '').replace(/\/+$/, '')
    return entries.some((raw) => {
      const f = String(raw).replace(/^\.\//, '').replace(/\/+$/, '')
      if (f.startsWith('!')) return false
      return f === p || p.startsWith(f + '/') || f.startsWith(p + '/')
    })
  }

  const orphans = new Set<string>()
  for (const need of requiredPublishPaths(pkg)) {
    if (coveredBy(workspace, need) && !coveredBy(published, need)) orphans.add(need)
  }
  return [...orphans]
}
