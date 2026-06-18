import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'

import { generateIconSetSource } from '../icons-plugin'

// ─── Tree-shaking proof ──────────────────────────────────────────────────────
//
// icons-plugin.test.ts asserts the generator EMITS the right shape (PascalCase
// `/*#__PURE__*/ createIcon(...)` per-icon exports). This file proves the shape
// actually TREE-SHAKES: bundle the REAL generator output through Vite (Rolldown
// — the real consumer bundler, which respects `/*#__PURE__*/`) off real temp
// files + Vite's built-in `?raw`, and assert an unused icon's bytes are GONE.
//
// Bisect contract: importing a per-icon binding drops every other icon AND the
// `Icon`/`REGISTRY` runtime registry; importing the registry `Icon` instead
// retains the whole set (the documented escape-hatch tradeoff). Both directions
// are asserted, so the test discriminates — it can't pass for the wrong reason.

const MARK = {
  used: 'USED_MARKER_7f3a91',
  unusedA: 'UNUSEDA_MARKER_7f3a91',
  unusedB: 'UNUSEDB_MARKER_7f3a91',
} as const

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-icons-ts-'))
  mkdirSync(join(dir, 'icons'), { recursive: true })
  // Real .svg files — Vite's built-in `?raw` loads each as its marker string.
  writeFileSync(join(dir, 'icons', 'used.svg'), `<svg>${MARK.used}</svg>`)
  writeFileSync(join(dir, 'icons', 'unused-a.svg'), `<svg>${MARK.unusedA}</svg>`)
  writeFileSync(join(dir, 'icons', 'unused-b.svg'), `<svg>${MARK.unusedB}</svg>`)
  // Stub `@pyreon/zero` (aliased below). The factory bodies carry an OPAQUE
  // apparent side effect (`SINK.push`) so the bundler CANNOT infer the calls
  // are pure on its own — exactly like the real cross-package `createIcon`
  // (whose body builds JSX). That makes the GENERATED `/*#__PURE__*/`
  // annotation the ONLY thing that lets an unused call drop — so this test
  // actually exercises (and bisects on) the annotation, not the bundler's
  // built-in purity guesswork.
  writeFileSync(
    join(dir, 'zero-stub.ts'),
    [
      'const SINK = []',
      'export const createIcon = (s) => { SINK.push(s); return () => s }',
      'export const createNamedIcon = (r) => { SINK.push(r); return () => r }',
      '',
    ].join('\n'),
  )
  // The REAL generator output, written as a real file so Vite resolves its
  // relative `./icons/*.svg?raw` imports + the `@pyreon/zero` alias.
  writeFileSync(
    join(dir, 'icons.gen.tsx'),
    generateIconSetSource(['used.svg', 'unused-a.svg', 'unused-b.svg'], {
      mode: 'inline',
      importDir: './icons',
    }),
  )
  // Two entries — one per consumption shape.
  writeFileSync(
    join(dir, 'entry-binding.ts'),
    "import { Used } from './icons.gen'\nexport default Used\n",
  )
  writeFileSync(
    join(dir, 'entry-registry.ts'),
    "import { Icon } from './icons.gen'\nexport default Icon\n",
  )
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** Bundle one entry through Vite (Rolldown) and return the chunk code. */
async function bundle(entryFile: string): Promise<string> {
  const result = await build({
    logLevel: 'silent',
    resolve: { alias: { '@pyreon/zero': join(dir, 'zero-stub.ts') } },
    build: {
      write: false,
      // Tree-shaking is independent of minification in the build pipeline;
      // keep it off so the marker strings stay greppable.
      minify: false,
      lib: { entry: join(dir, entryFile), formats: ['es'], fileName: 'b' },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  let code = ''
  for (const o of outputs) {
    for (const chunk of (o as { output: { code?: string }[] }).output) {
      code += chunk.code ?? ''
    }
  }
  return code
}

describe('iconsPlugin generated output — tree-shaking', () => {
  it('importing a per-icon binding DROPS every unused icon + the runtime registry', async () => {
    // Entry uses ONLY `Used` → Rolldown drops UnusedA / UnusedB / Icon / REGISTRY.
    const code = await bundle('entry-binding.ts')
    expect(code).toContain(MARK.used)
    expect(code).not.toContain(MARK.unusedA)
    expect(code).not.toContain(MARK.unusedB)
  })

  it('importing the runtime registry Icon RETAINS the whole set (escape-hatch tradeoff)', async () => {
    // `Icon` resolves names at runtime via `registry[name]`, so the bundler
    // can't prove which icons are reachable — every icon stays. The
    // discriminating control: it proves the test above passes BECAUSE of
    // per-binding tree-shaking, not because the fixture drops everything.
    const code = await bundle('entry-registry.ts')
    expect(code).toContain(MARK.used)
    expect(code).toContain(MARK.unusedA)
    expect(code).toContain(MARK.unusedB)
  })
})
