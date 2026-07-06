// Tests for the programmatic build API.
//
// Verify the directory-walk + per-file transform + write pipeline by
// pointing the build at the seven starter fixtures from
// @pyreon/native-compiler and asserting:
//   1. Every fixture produces one output file in the target's extension
//   2. Source-map directives are prepended to each output
//   3. Output content matches what `transform()` directly produces
//   4. Filename mapping `.tsx → .swift/.kt` is correct
//
// Tests use a per-run tempdir created via mkdtempSync so parallel runs
// don't collide and Math.random isn't anywhere near the path
// (CodeQL avoidance — secure temp file conventions per #796).

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { transform } from '@pyreon/native-compiler'
import { build, conditionalKotlinImports, findTsxFiles, isWebOnlyEntry } from '../build'

const HERE = dirname(fileURLToPath(import.meta.url))
// Compiler fixtures live in the native-compiler package — reach them via
// the workspace's predictable layout.
const COMPILER_FIXTURES = resolve(HERE, '..', '..', '..', 'compiler', 'src', 'fixtures')

describe('@pyreon/native-cli build', () => {
  let tempOut: string

  beforeEach(() => {
    tempOut = mkdtempSync(join(tmpdir(), 'pyreon-native-cli-test-'))
  })

  afterEach(() => {
    try {
      rmSync(tempOut, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort.
    }
  })

  it('findTsxFiles discovers all 7+ fixtures', () => {
    const files = findTsxFiles(COMPILER_FIXTURES)
    expect(files.length).toBeGreaterThanOrEqual(7)
    expect(files.every((f) => f.endsWith('.tsx'))).toBe(true)
    expect(files.every((f) => !f.endsWith('.test.tsx'))).toBe(true)
  })

  it('build compiles all fixtures to Swift', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'swift',
    })
    expect(result.filesCompiled).toBeGreaterThanOrEqual(7)
    // tier2-*.tsx fixtures are regression locks for the Tier-2 Strategy-B
    // silent-drop diagnostics (Gap 4 PR-1 / PR-2 / PR-3 / PR-4) — they
    // deliberately emit warnings. Filter them out before asserting the
    // remaining fixtures emit nothing.
    const nonTier2Warnings = result.warnings.filter(
      // tier2- fixtures deliberately emit silent-drop diagnostics; the
      // font warning is also by-design — showcase-tasks uses <Text
      // font="Brand"> and this generic build passes no fonts map, so
      // the Swift emit warns + falls back to the canonical name (the
      // real build.sh passes --fonts and gets the PostScript map).
      (w) => !w.file.includes('/tier2-') && !w.warning.includes('no bundled font'),
    )
    expect(nonTier2Warnings).toEqual([])

    // Every output exists + has the .swift extension + carries the
    // source-map directive.
    for (const output of result.outputs) {
      expect(output.output.endsWith('.swift')).toBe(true)
      const written = readFileSync(output.output, 'utf8')
      expect(written).toBe(output.code)
      expect(written.startsWith('#sourceLocation(file: "')).toBe(true)
    }
  })

  it('build compiles all fixtures to Kotlin', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
    })
    expect(result.filesCompiled).toBeGreaterThanOrEqual(7)
    // tier2-*.tsx fixtures are regression locks for the Tier-2 Strategy-B
    // silent-drop diagnostics (Gap 4 PR-1 / PR-2 / PR-3 / PR-4) — they
    // deliberately emit warnings. Filter them out before asserting the
    // remaining fixtures emit nothing.
    const nonTier2Warnings = result.warnings.filter(
      // tier2- fixtures deliberately emit silent-drop diagnostics; the
      // font warning is also by-design — showcase-tasks uses <Text
      // font="Brand"> and this generic build passes no fonts map, so
      // the Swift emit warns + falls back to the canonical name (the
      // real build.sh passes --fonts and gets the PostScript map).
      (w) => !w.file.includes('/tier2-') && !w.warning.includes('no bundled font'),
    )
    expect(nonTier2Warnings).toEqual([])

    for (const output of result.outputs) {
      expect(output.output.endsWith('.kt')).toBe(true)
      const written = readFileSync(output.output, 'utf8')
      expect(written).toBe(output.code)
      expect(written.startsWith('// pyreon-source: ')).toBe(true)
    }
  })

  it('build with kotlinPackage prepends a `package` declaration to every .kt file', () => {
    // Real Android consumers import the emitted Composable by FQN
    // (e.g. `import com.pyreon.generated.TodoApp`), which requires a
    // matching `package` declaration in the emitted file. Without the
    // option the emit lives in Kotlin's anonymous root package — fine
    // for single-file `kotlinc` validation but unusable from a
    // multi-file host.
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
      kotlinPackage: 'com.pyreon.generated',
    })
    expect(result.filesCompiled).toBeGreaterThanOrEqual(7)

    for (const output of result.outputs) {
      const written = readFileSync(output.output, 'utf8')
      const firstLine = written.split('\n')[0] ?? ''
      expect(firstLine).toBe('package com.pyreon.generated')
      // Source-map header comes AFTER the package declaration so the
      // Kotlin parser sees the package as the file's first token.
      expect(written).toContain('// pyreon-source: ')
    }
  })

  it('build with kotlinPackage on swift target is silently ignored (no-op)', () => {
    // Belt-and-suspenders: passing the option to a Swift build must
    // not affect the emit. Swift has no `package` statement.
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'swift',
      kotlinPackage: 'com.pyreon.generated',
    })
    for (const output of result.outputs) {
      const written = readFileSync(output.output, 'utf8')
      expect(written).not.toContain('package com.pyreon.generated')
    }
  })

  it('build without kotlinPackage emits Kotlin in the anonymous package (back-compat)', () => {
    // Pre-extension behavior preserved when the option is unset.
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
    })
    for (const output of result.outputs) {
      const written = readFileSync(output.output, 'utf8')
      const firstLine = written.split('\n')[0] ?? ''
      expect(firstLine.startsWith('package ')).toBe(false)
      expect(firstLine.startsWith('// pyreon-source: ')).toBe(true)
    }
  })

  it('build output matches direct transform() result (modulo source-map + import headers)', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'swift',
    })
    // For one canonical fixture, confirm the build's output body equals
    // what calling transform() directly produces — i.e. the CLI doesn't
    // mutate the compiler's emit.
    const counter = result.outputs.find((o) => o.source.endsWith('02-signal.tsx'))
    expect(counter).toBeDefined()
    const source = readFileSync(counter!.source, 'utf8')
    const direct = transform(source, { target: 'swift' }).code
    // The build prepends a source-map header + an import preamble; strip
    // both before comparing. Format:
    //   line 0: #sourceLocation(...)
    //   lines 1..N: imports
    //   blank line
    //   then: emitted code
    const lines = counter!.code.split('\n')
    // First line is the source-map directive; skip the import block
    // (lines starting with `import ` plus the trailing blank line).
    let idx = 1
    while (idx < lines.length && lines[idx]?.startsWith('import ')) idx++
    if (lines[idx] === '') idx++ // skip blank separator
    const builtBody = lines.slice(idx).join('\n')
    expect(builtBody).toBe(direct)
  })

  it('Swift outputs include the SwiftUI + PyreonRuntime + PyreonRouter import preamble', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'swift',
    })
    for (const output of result.outputs) {
      expect(output.code).toContain('import SwiftUI')
      expect(output.code).toContain('import PyreonRuntime')
      expect(output.code).toContain('import PyreonRouter')
    }
  })

  it('Kotlin outputs include the Compose + Pyreon-runtime import preamble', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
      kotlinPackage: 'com.pyreon.generated',
    })
    for (const output of result.outputs) {
      expect(output.code).toContain('import androidx.compose.runtime.*')
      expect(output.code).toContain('import androidx.compose.material.*')
      expect(output.code).toContain('import kotlinx.serialization.Serializable')
      expect(output.code).toContain('import com.pyreon.runtime.*')
      expect(output.code).toContain('import com.pyreon.router.*')
      // Package declaration still comes FIRST, then source-map header,
      // then imports, then the emitted body.
      expect(output.code).toMatch(/^package com\.pyreon\.generated\n/)
    }
  })

  it('Kotlin conditional imports: fetch + WebView-bridge shapes pull serialization.json.Json; plain outputs stay clean', () => {
    // Device-found (fetch-arc): the kotlinc validate loop concatenates
    // stubs into the same file (no imports needed), so the missing
    // withContext / Dispatchers / Json imports only surfaced on the
    // first REAL gradle assembleDebug of a useFetch screen. Bisect
    // site: the conditionalKotlinImports call in the finalCode
    // assembly. The WebView live-data bridge adds a SECOND Json consumer
    // (`PyreonJson.encode(data)`) — a NON-fetch output that legitimately
    // needs serialization.json.Json too (but not coroutines). So the
    // real invariant is "Json import iff Json is actually used", not
    // "non-fetch ⇒ no Json".
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
      kotlinPackage: 'com.pyreon.generated',
    })
    const fetchOutputs = result.outputs.filter((o) => o.code.includes('PyreonFetch<'))
    expect(fetchOutputs.length).toBeGreaterThan(0)
    for (const output of fetchOutputs) {
      expect(output.code).toContain('import kotlinx.coroutines.withContext')
      expect(output.code).toContain('import kotlinx.coroutines.Dispatchers')
      expect(output.code).toContain('import kotlinx.serialization.json.Json')
    }
    // WebView live-data bridge — `PyreonJson.encode(data)` needs the
    // serialization.json.Json import even though it's a non-fetch
    // (synchronous, no coroutines) output.
    const bridgeOutputs = result.outputs.filter((o) => o.code.includes('PyreonJson.encode('))
    expect(bridgeOutputs.length).toBeGreaterThan(0)
    for (const output of bridgeOutputs) {
      expect(output.code).toContain('import kotlinx.serialization.json.Json')
      expect(output.code).not.toContain('import kotlinx.coroutines.withContext')
    }
    // Outputs using NEITHER fetch NOR the bridge stay clean of both the
    // coroutine and the serialization.json imports.
    const plain = result.outputs.filter(
      (o) => !o.code.includes('PyreonFetch<') && !o.code.includes('PyreonJson.encode('),
    )
    expect(plain.length).toBeGreaterThan(0)
    for (const output of plain) {
      expect(output.code).not.toContain('import kotlinx.coroutines.withContext')
      expect(output.code).not.toContain('import kotlinx.serialization.json.Json')
    }
  })

  it('Kotlin conditional imports: <Field kind> pulls PasswordVisualTransformation + VisualTransformation', () => {
    // <Field kind="password"> emits `PasswordVisualTransformation()`; the
    // dynamic show/hide toggle also emits `VisualTransformation.None`. Both live
    // in androidx.compose.ui.text.input (only `ImeAction` from that package is
    // unconditionally imported), so both are stub-masked on the kotlinc validate
    // loop but need a real import on a gradle build. No example had used a
    // password field, so the STATIC path shipped with a latent unresolved
    // reference — this closes it alongside the dynamic-kind lowering. Direct
    // unit test (no example produces this yet, so the fixture-build tests can't
    // reach it). Bisect site: the PasswordVisualTransformation / VisualTransformation
    // branches in conditionalKotlinImports.
    const staticPw = conditionalKotlinImports('visualTransformation = PasswordVisualTransformation()')
    expect(staticPw).toContain('import androidx.compose.ui.text.input.PasswordVisualTransformation')
    // static password does NOT reference VisualTransformation.None → no base-type
    // import (the `input.` prefix disambiguates from PasswordVisualTransformation).
    expect(staticPw).not.toContain('import androidx.compose.ui.text.input.VisualTransformation')

    const dynamicPw = conditionalKotlinImports(
      'visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation()',
    )
    expect(dynamicPw).toContain('import androidx.compose.ui.text.input.PasswordVisualTransformation')
    expect(dynamicPw).toContain('import androidx.compose.ui.text.input.VisualTransformation')

    // a plain field pulls neither
    const plain = conditionalKotlinImports('TextField(value = draft, onValueChange = { draft = it })')
    expect(plain).not.toContain('PasswordVisualTransformation')
    expect(plain).not.toContain('text.input.VisualTransformation')
  })

  it('Kotlin conditional imports: Color() / RoundedCornerShape() pull their graphics imports', () => {
    // Device-found (icon arc): `color=` props emit `Color(0xFF…)` and
    // `radius` props emit `RoundedCornerShape(…)`, but neither is in a
    // star-imported package. The kotlinc validate stubs provide both,
    // so only a REAL Android build surfaced the unresolved reference
    // (the icons header's color="primary" was the first real-build
    // Color() in any example). Bisect site: the Color/RoundedCornerShape
    // branches in conditionalKotlinImports.
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
      kotlinPackage: 'com.pyreon.generated',
    })
    const colorOutputs = result.outputs.filter((o) => o.code.includes('Color('))
    expect(colorOutputs.length).toBeGreaterThan(0)
    for (const output of colorOutputs) {
      expect(output.code).toContain('import androidx.compose.ui.graphics.Color')
    }
    // Outputs with no Color() don't carry the import.
    for (const output of result.outputs.filter((o) => !o.code.includes('Color('))) {
      expect(output.code).not.toContain('import androidx.compose.ui.graphics.Color')
    }
  })

  it('Kotlin conditional imports: Scroll / Modal / remote-Image pull foundation / ui.window / coil', () => {
    // Vocabulary-completion (audit-found): <Scroll> emits verticalScroll/
    // rememberScrollState (root androidx.compose.foundation, NOT the
    // star-imported .layout/.lazy/.text sub-packages), <Modal> emits
    // Dialog (androidx.compose.ui.window, NOT star-imported ui.*), and a
    // remote <Image> emits AsyncImage (Coil). All three were stub-masked
    // — green in the validate loop, RED on a real gradle build — until
    // the showcase first used them. Bisect site: the
    // verticalScroll/Dialog/AsyncImage branches in conditionalKotlinImports.
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
      kotlinPackage: 'com.pyreon.generated',
    })
    for (const output of result.outputs.filter((o) => o.code.includes('verticalScroll('))) {
      expect(output.code).toContain('import androidx.compose.foundation.verticalScroll')
      expect(output.code).toContain('import androidx.compose.foundation.rememberScrollState')
    }
    for (const output of result.outputs.filter((o) => o.code.includes('Dialog('))) {
      expect(output.code).toContain('import androidx.compose.ui.window.Dialog')
    }
    for (const output of result.outputs.filter((o) => o.code.includes('AsyncImage('))) {
      expect(output.code).toContain('import coil.compose.AsyncImage')
    }
  })

  // ── Web-entry skip (local-proof-found scaffold bug) ────────────────────────
  // A `.tsx` importing a web-only runtime (@pyreon/runtime-dom client mount /
  // @pyreon/runtime-server SSR) is a WEB ENTRY POINT, not a shared component.
  // Compiling it emits `document.getElementById(...)` into Swift/Kotlin, which
  // can't compile. The scaffold's `entry-web.tsx` (mount(App, root)) hit this:
  // a real device build failed until the native build learned to skip it.
  // Bisect site: the `isWebOnlyEntry(code)` guard in build().
  describe('web-entry skip', () => {
    it('isWebOnlyEntry detects @pyreon/runtime-dom / runtime-server imports (not shared components)', () => {
      expect(isWebOnlyEntry(`import { mount } from '@pyreon/runtime-dom'\nmount(App, root)`)).toBe(true)
      expect(isWebOnlyEntry(`import { renderToString } from "@pyreon/runtime-server"`)).toBe(true)
      // Shared component sources — NOT web-only.
      expect(isWebOnlyEntry(`import { signal } from '@pyreon/reactivity'`)).toBe(false)
      expect(isWebOnlyEntry(`import { Stack, Text } from '@pyreon/primitives'`)).toBe(false)
      // A bare mention in a comment must not false-positive (import-anchored).
      expect(isWebOnlyEntry(`// see @pyreon/runtime-dom for the web mount`)).toBe(false)
    })

    it('build SKIPS a web entry (no native garbage) but compiles the shared component', () => {
      const src = mkdtempSync(join(tmpdir(), 'pyreon-native-cli-src-'))
      mkdirSync(src, { recursive: true })
      writeFileSync(
        join(src, 'App.tsx'),
        `import { signal } from '@pyreon/reactivity'\nimport { Stack, Text } from '@pyreon/primitives'\nexport function App() {\n  const c = signal(0)\n  return <Stack><Text>{c}</Text></Stack>\n}\n`,
      )
      writeFileSync(
        join(src, 'entry-web.tsx'),
        `import { mount } from '@pyreon/runtime-dom'\nimport { App } from './App'\nconst root = document.getElementById('app')\nif (root) mount(App, root)\n`,
      )
      try {
        for (const target of ['swift', 'kotlin'] as const) {
          const result = build({ source: src, out: tempOut, target })
          // entry-web.tsx skipped, App.tsx compiled.
          expect(result.filesCompiled).toBe(1)
          expect(result.skippedWebEntries).toHaveLength(1)
          expect(result.skippedWebEntries[0]).toContain('entry-web.tsx')
          expect(result.outputs).toHaveLength(1)
          expect(result.outputs[0]!.source).toContain('App.tsx')
          // No emitted native file references the DOM (the garbage we skip).
          for (const o of result.outputs) {
            expect(o.code).not.toContain('document.getElementById')
          }
        }
      } finally {
        rmSync(src, { recursive: true, force: true })
      }
    })
  })
})
