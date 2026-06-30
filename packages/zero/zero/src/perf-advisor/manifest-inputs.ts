/**
 * Build the perf-advisor's per-route inputs from a Vite `build.manifest`.
 *
 * Pure with INJECTED I/O (`fileSize` / `readCss`) so it's fixture-testable
 * against a realistic manifest shape without a real build. The thin
 * `perfAdvisorPlugin` `closeBundle` shell supplies the real `fs`-backed
 * readers.
 *
 * "Route" = each `isEntry` / `isDynamicEntry` chunk. In a zero build every
 * route is a lazy import → its own dynamic-entry chunk, so this is the
 * mode-agnostic per-route unit (no fs-router coupling). For each, we compute:
 *   - `jsBytes`  — total bytes of the chunk's STATIC closure (the JS the
 *      browser actually loads for that route). Static-only — `dynamicImports`
 *      (islands / lazy) are deliberately NOT followed, same rule as
 *      `ssg-modulepreload`.
 *   - `cssText`  — concatenated CSS emitted for the closure (for the CLS scan).
 *
 * `collapseEnabled` / `collapsibleSiteCount` / `heroImage` are left at
 * no-op defaults here — those checks need source scanning + HTML-preload
 * parsing the next increment adds; their check functions already ship in
 * `checks.ts`.
 */
import type { ViteManifest } from '../ssg-modulepreload'
import type { RouteAdvisorInput } from './checks'

/** Walk the STATIC-import closure of `entryKey`, collecting emitted JS + CSS files. */
function closureFiles(manifest: ViteManifest, entryKey: string): { js: string[]; css: string[] } {
  const js = new Set<string>()
  const css = new Set<string>()
  const visited = new Set<string>()
  const stack = [entryKey]
  while (stack.length > 0) {
    const key = stack.pop()!
    if (visited.has(key)) continue
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) continue
    if (chunk.file?.endsWith('.js')) js.add(chunk.file)
    for (const c of chunk.css ?? []) css.add(c)
    // STATIC imports only — NEVER chunk.dynamicImports (islands / lazy).
    for (const imp of chunk.imports ?? []) {
      if (!visited.has(imp)) stack.push(imp)
    }
  }
  return { js: [...js], css: [...css] }
}

/** Derive a human-readable route label for a manifest entry chunk. */
export function routeLabelForChunk(key: string, chunk: ViteManifest[string]): string {
  // Prefer the source path (`src/routes/about.tsx`), then the chunk name,
  // then the manifest key, then the emitted file.
  const raw = chunk.src ?? key ?? chunk.file ?? 'route'
  // `index.html` is the entry shell.
  if (raw === 'index.html' || chunk.isEntry) return raw === 'index.html' ? '/ (entry)' : raw
  return raw
}

export interface CollectRouteInputsArgs {
  manifest: ViteManifest
  /** Bytes of an emitted dist file (relative path as it appears in the manifest). 0 if unreadable. */
  fileSize: (file: string) => number
  /** Concatenated CSS text of the given dist CSS files. '' if none/unreadable. */
  readCss: (cssFiles: readonly string[]) => string
  /** Per-route JS budget in bytes. */
  jsBudget: number
}

/**
 * Map a Vite manifest → one `RouteAdvisorInput` per entry/dynamic-entry
 * chunk, populating the JS-budget + CLS inputs. Deterministically ordered
 * by route label.
 */
export function collectRouteInputsFromManifest(args: CollectRouteInputsArgs): RouteAdvisorInput[] {
  const { manifest, fileSize, readCss, jsBudget } = args
  const inputs: RouteAdvisorInput[] = []
  for (const [key, chunk] of Object.entries(manifest)) {
    if (!chunk.isEntry && !chunk.isDynamicEntry) continue
    const { js, css } = closureFiles(manifest, key)
    let jsBytes = 0
    for (const f of js) jsBytes += fileSize(f)
    const input: RouteAdvisorInput = {
      path: routeLabelForChunk(key, chunk),
      // collapse + hero inputs are populated by a later increment; defaulted
      // so those checks no-op here (the check functions already exist).
      collapseEnabled: true,
      collapsibleSiteCount: 0,
      jsBytes,
      jsBudget,
    }
    // exactOptionalPropertyTypes: only set cssText when present (never an
    // explicit `undefined`).
    if (css.length > 0) input.cssText = readCss(css)
    inputs.push(input)
  }
  inputs.sort((a, b) => a.path.localeCompare(b.path))
  return inputs
}
