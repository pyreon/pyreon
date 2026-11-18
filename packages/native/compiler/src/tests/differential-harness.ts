// Differential execution of compiled pure logic: the SAME TypeScript runs on the web (as JavaScript) and through
// PMTC on Swift and Kotlin (compiled with the real toolchains against the SHIPPED runtime files), and every case's
// result is compared as a string.
//
// Why it exists: every other gate (golden hashes, the stub typecheck, the example sweep) proves the emit COMPILES.
// A silent miscompile is output that compiles and behaves differently — `(2.5).toFixed(0)` printing "2", an
// optional interpolated as "Optional(3)", `split('')` returning one element. Only running both sides finds those.
//
// A corpus is a module of `export function c_<name>(): string { … }` cases (plus any helpers they call). Each case
// returns a string so the comparison is exact. Swift runs every case in its own process (a trap — integer
// overflow, division by zero — kills only that case, reported as `<CRASH>`); Kotlin catches per case (`<THROW …>`).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform } from './first-party-plugins'

const NATIVE = join(__dirname, '../../..')

const SWIFT_RUNTIME = ['PyreonNumber', 'PyreonCollections', 'PyreonDate', 'PyreonJSON', 'PyreonSlice', 'PyreonIntl'].map(
  (f) => join(NATIVE, 'runtime-swift/Sources/PyreonRuntime', `${f}.swift`),
)

const KOTLIN_RUNTIME = ['PyreonNumber', 'PyreonSlice', 'PyreonDate', 'PyreonDateValue', 'PyreonDateJson', 'PyreonJson'].map((f) =>
  join(NATIVE, 'runtime-kotlin/src/main/kotlin/com/pyreon/runtime', `${f}.kt`),
)

export interface DifferentialResult {
  names: string[]
  web: string[]
  swift?: string[]
  kotlin?: string[]
  warnings: { swift: string[]; kotlin: string[] }
}

/** The names of the corpus's cases, in source order. */
export function caseNames(src: string): string[] {
  return [...src.matchAll(/export function (c_\w+)\(\)/g)].map((m) => m[1]!)
}

/** The web result: the corpus transpiled to JavaScript and run here. */
export function runWeb(src: string): string[] {
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const mod: Record<string, () => unknown> = {}
  new Function('exports', js)(mod)

  return caseNames(src).map((n) => {
    try {
      return String(mod[n]!())
    } catch (e) {
      return `<THROW ${(e as Error).name}>`
    }
  })
}

/** A JDK to run the jar — commonly off PATH under Homebrew. */
export function jvmPath(): string | undefined {
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java']) {
    if (existsSync(c)) return c
  }
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    return undefined
  }
}

/** The real kotlinx-serialization from the Gradle cache plus kotlinc's serialization plugin (PyreonJson.kt needs both). */
export function kotlinToolchain(): { classpath: string; plugin: string; stdlib: string } | undefined {
  if (!isKotlincAvailable() || jvmPath() === undefined) return undefined
  let home: string
  try {
    home = join(dirname(realpathSync(execFileSync('which', ['kotlinc'], { encoding: 'utf8' }).trim())), '..')
  } catch {
    return undefined
  }
  const lib = [join(home, 'lib'), join(home, 'libexec', 'lib')].find((d) => existsSync(join(d, 'kotlin-stdlib.jar')))
  if (lib === undefined) return undefined
  const plugin = join(lib, 'kotlinx-serialization-compiler-plugin.jar')
  const stdlib = join(lib, 'kotlin-stdlib.jar')
  if (!existsSync(plugin)) return undefined
  const cache = join(homedir(), '.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlinx')
  const jar = (artifact: string, version: string): string | undefined => {
    const dir = join(cache, artifact, version)
    if (!existsSync(dir)) return undefined
    for (const h of readdirSync(dir)) {
      const f = join(dir, h, `${artifact}-${version}.jar`)
      if (existsSync(f)) return f
    }

    return undefined
  }
  // The version the example Android apps build against.
  const core = jar('kotlinx-serialization-core-jvm', '1.9.0')
  const json = jar('kotlinx-serialization-json-jvm', '1.9.0')
  if (core === undefined || json === undefined) return undefined

  return { classpath: `${core}:${json}`, plugin, stdlib }
}

export const canRunSwift = (): boolean => isSwiftcAvailable() && process.platform === 'darwin'
export const canRunKotlin = (): boolean => kotlinToolchain() !== undefined

/** Drop the corpus's host component from an emitted file (the cases are top-level functions). */
function stripComponent(code: string, target: 'swift' | 'kotlin'): string {
  const marker = target === 'swift' ? /\nstruct DiffHost: View \{/ : /\n@Composable\nfun DiffHost\(/
  const m = marker.exec(code)
  if (!m) return code
  let i = code.indexOf('{', m.index)
  let depth = 0
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) break
  }

  return code.slice(0, m.index) + code.slice(i + 1)
}

/** Compile the corpus through PMTC for `target`. Throws with the toolchain's diagnostics when the emit does not compile. */
export function emitCorpus(src: string, target: 'swift' | 'kotlin'): { code: string; warnings: string[] } {
  const r = transform(`${src}\nexport function DiffHost() { return <Text>{'x'}</Text> }\n`, { target })
  const code = stripComponent(r.code ?? '', target).replace(
    /^import (SwiftUI|PyreonRuntime|PyreonRouter|androidx\..*|com\.pyreon\..*)$/gm,
    '',
  )

  return { code, warnings: r.warnings }
}

export function runSwift(src: string): string[] {
  const names = caseNames(src)
  const { code } = emitCorpus(src, 'swift')
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-diff-swift-'))
  try {
    const main = `import Foundation\n${code}\nswitch Int(CommandLine.arguments[1])! {\n${names
      .map((n, i) => `case ${i}: print(${n}(), terminator: "")`)
      .join('\n')}\ndefault: break\n}\n`
    writeFileSync(join(dir, 'main.swift'), main)
    try {
      execFileSync('swiftc', ['-o', join(dir, 'run'), ...SWIFT_RUNTIME, join(dir, 'main.swift')], { stdio: 'pipe' })
    } catch (e) {
      throw new Error(`the Swift emit of the corpus does not compile:\n${String((e as { stderr?: unknown }).stderr ?? e)}`)
    }

    return names.map((_, i) => {
      try {
        return execFileSync(join(dir, 'run'), [String(i)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      } catch {
        return '<CRASH>'
      }
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function runKotlin(src: string): string[] {
  const kx = kotlinToolchain()
  if (kx === undefined) throw new Error('no Kotlin toolchain (kotlinc + JVM + kotlinx-serialization 1.9.0 jars)')
  const names = caseNames(src)
  const { code } = emitCorpus(src, 'kotlin')
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-diff-kotlin-'))
  try {
    // Each result on its own line, escaped, so a newline inside a result cannot shift the others.
    const main = `package com.pyreon.runtime\nimport kotlinx.serialization.Serializable\n${code}\nfun main() {\n${names
      .map(
        (n) =>
          `  try { println(${n}().toString().replace("\\\\", "\\\\\\\\").replace("\\n", "\\\\n")) } catch (e: Throwable) { println("<THROW " + e.javaClass.simpleName + ">") }`,
      )
      .join('\n')}\n}\n`
    writeFileSync(join(dir, 'Main.kt'), main)
    try {
      execFileSync(
        'kotlinc',
        ['-nowarn', `-Xplugin=${kx.plugin}`, '-cp', kx.classpath, ...KOTLIN_RUNTIME, join(dir, 'Main.kt'), '-d', join(dir, 'out')],
        { stdio: 'pipe' },
      )
    } catch (e) {
      throw new Error(`the Kotlin emit of the corpus does not compile:\n${String((e as { stderr?: unknown }).stderr ?? e)}`)
    }
    const out = execFileSync(jvmPath()!, ['-cp', `${join(dir, 'out')}:${kx.classpath}:${kx.stdlib}`, 'com.pyreon.runtime.MainKt'], {
      maxBuffer: 64 * 1024 * 1024,
    }).toString('utf8')

    return out
      .split('\n')
      .slice(0, names.length)
      .map((l) => l.replace(/\\(n|\\)/g, (_, c: string) => (c === 'n' ? '\n' : '\\')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** `name: web | swift | kotlin` for every case whose native result differs — the readable failure of a parity spec. */
export function mismatches(names: string[], web: string[], native: string[]): string[] {
  return names.flatMap((n, i) => (web[i] === native[i] ? [] : [`${n}: web=${JSON.stringify(web[i])} native=${JSON.stringify(native[i])}`]))
}
