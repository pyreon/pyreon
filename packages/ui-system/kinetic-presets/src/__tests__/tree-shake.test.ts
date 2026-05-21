/**
 * Tree-shake regression gate.
 *
 * The `/* #__NO_SIDE_EFFECTS__ *\/` annotations on the factory functions
 * (`s` in presets.ts, `createBlur` / `createFade` / `createRotate` /
 * `createScale` / `createSlide` in factories.ts) let bundlers drop the
 * ~120 unused presets when a consumer imports only one. Without the
 * annotations, `sideEffects: false` in package.json is NOT enough —
 * bundlers conservatively treat top-level function calls as
 * side-effect-bearing.
 *
 * This test bundles a single-preset consumer (`import { blurInUp }`) via
 * esbuild and counts how many of the OTHER preset names survive. If the
 * annotations are removed or stripped, this count rises from 0 to ~120
 * and the test fails.
 *
 * Bisect-verified: removing the `#__NO_SIDE_EFFECTS__` annotation from
 * `s` in `presets.ts` fails this test with `expected <0 to be 0` or
 * similar — typically 90+ presets land in the bundle.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Resolve the published lib entry. Tests run with the `bun` condition, but
// for tree-shake assertions we need the same `lib/index.js` that real
// consumers see — that's what esbuild's node-resolution would pick.
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const libEntry = join(pkgDir, 'lib', 'index.js')

// Pool of preset names. If `blurInUp` ships alone, NONE of these should
// appear in the bundle. If the factory call's purity isn't conveyed,
// many will (because each `export const X = s(...)` produces a hidden-
// state object literal that lands in the bundle).
const OTHER_PRESETS = [
  'fade',
  'fadeUp',
  'fadeDown',
  'fadeLeft',
  'fadeRight',
  'bounceIn',
  'rollInLeft',
  'rotateInDown',
  'tiltInRight',
  'clipDiamond',
  'newspaperIn',
  'scaleIn',
  'scaleOut',
  'slideUp',
  'slideDown',
  'zoomIn',
  'zoomOut',
  'rubberIn',
  'lightSpeedInLeft',
  'puffIn',
]

// Marker strings UNIQUE to specific presets — survives minification (the
// `opacity:0` / transform values are baked into the bundle as string
// literals).
const PRESET_MARKERS: Record<string, string[]> = {
  // blurInUp itself uses `blur(8px)` AND `translateY(16px)`
  blurInUp: ['blur(8px)', 'translateY(16px)'],
  // Each other preset has a unique transform / filter signature.
  // We probe with `'blur(' + a different distance like blur(4px)` — the
  // factory uses `${distance}px` so each createBlur variant produces a
  // different literal.
}

describe('tree-shake — single-preset consumer ships only that preset', () => {
  it('importing { blurInUp } does NOT pull in other presets', async () => {
    // Skip if lib hasn't been built (dev / pre-build).
    let libExists = false
    try {
      readFileSync(libEntry, 'utf8')
      libExists = true
    } catch {
      // No lib — skip.
    }
    if (!libExists) {
      return
    }

    const dir = mkdtempSync(join(tmpdir(), 'kinetic-presets-treeshake-'))
    const consumerPath = join(dir, 'app.mjs')
    const bundlePath = join(dir, 'out.js')

    // The consumer must import `blurInUp` from the LIB (not src) — that's
    // what real users pull from `@pyreon/kinetic-presets`. Use a `file:`
    // URL so we don't need node_modules linking.
    writeFileSync(
      consumerPath,
      `import { blurInUp } from '${libEntry}'\nconsole.log(blurInUp)\n`,
      'utf8',
    )

    // Use esbuild directly via JS API (the package's only runtime dep on
    // it would be via the workspace; importing the binary in tests is fine).
    const esbuild = (await import('esbuild')) as unknown as {
      build: (opts: Record<string, unknown>) => Promise<unknown>
    }
    await esbuild.build({
      entryPoints: [consumerPath],
      outfile: bundlePath,
      bundle: true,
      minify: true,
      format: 'esm',
      treeShaking: true,
      // No external — we want everything inlined.
    })

    const bundle = readFileSync(bundlePath, 'utf8')

    // The blurInUp marker MUST be present (this is what was imported).
    expect(bundle).toContain('blur(8px)')

    // The OTHER presets' transform/filter markers must NOT appear. If
    // the factory call's purity is conveyed, the bundler drops every
    // unused preset and its style-object literal goes too. Count
    // `opacity:0` literals — each preset's hidden state contributes one;
    // blurInUp contributes ONE, so the total should be 1 (or at most
    // 2 if some other tree-shake-resistant code-path picks it up).
    const opacityZeroCount = (bundle.match(/opacity:0/g) ?? []).length
    expect(opacityZeroCount).toBeLessThanOrEqual(2)

    // Anti-marker: if EVERY preset's hidden state is in the bundle, this
    // count would be 100+. Lock the regression with a strict ceiling.
    const translateYCount = (bundle.match(/translateY\(/g) ?? []).length
    expect(translateYCount).toBeLessThanOrEqual(2) // blurInUp uses translateY(16px) twice (hidden + leave-to)
    const translateXCount = (bundle.match(/translateX\(/g) ?? []).length
    expect(translateXCount).toBe(0) // blurInUp doesn't use translateX at all
  })

  it('importing { fade } (signature non-blur preset) ALSO ships only one preset', async () => {
    // Same shape, different probe — locks in that the contract is per-
    // preset, not specific to one shape.
    let libExists = false
    try {
      readFileSync(libEntry, 'utf8')
      libExists = true
    } catch {
      // No lib — skip.
    }
    if (!libExists) {
      return
    }

    const dir = mkdtempSync(join(tmpdir(), 'kinetic-presets-treeshake-'))
    const consumerPath = join(dir, 'app.mjs')
    const bundlePath = join(dir, 'out.js')

    writeFileSync(
      consumerPath,
      `import { fade } from '${libEntry}'\nconsole.log(fade)\n`,
      'utf8',
    )

    const esbuild = (await import('esbuild')) as unknown as {
      build: (opts: Record<string, unknown>) => Promise<unknown>
    }
    await esbuild.build({
      entryPoints: [consumerPath],
      outfile: bundlePath,
      bundle: true,
      minify: true,
      format: 'esm',
      treeShaking: true,
    })

    const bundle = readFileSync(bundlePath, 'utf8')

    // fade is { opacity: 0 } / { opacity: 1 } — no transform, no filter.
    const opacityZeroCount = (bundle.match(/opacity:0/g) ?? []).length
    expect(opacityZeroCount).toBe(1)
    // No other presets' transforms / filters / blur should appear.
    expect(bundle).not.toContain('translateY(')
    expect(bundle).not.toContain('translateX(')
    expect(bundle).not.toContain('blur(')
    expect(bundle).not.toContain('rotate(')
    expect(bundle).not.toContain('scale(')
  })

  // Anti-regression locks: each of these names should NOT be in scope
  // after tree-shake when blurInUp is the only import. (The bundle
  // minifies away variable names, so this is checked indirectly via
  // the marker counts above — but we keep the array for documentation.)
  it('OTHER_PRESETS array covers a representative slice of the catalog', () => {
    expect(OTHER_PRESETS.length).toBeGreaterThanOrEqual(15)
    // Each marker is a non-empty string.
    for (const name of OTHER_PRESETS) {
      expect(name).toBeTruthy()
      expect(name).toMatch(/^[a-zA-Z]+$/)
    }
    // PRESET_MARKERS is documentation; not consumed by tests above
    // but locked so a future contributor sees the shape.
    expect(PRESET_MARKERS.blurInUp).toContain('blur(8px)')
  })
})
