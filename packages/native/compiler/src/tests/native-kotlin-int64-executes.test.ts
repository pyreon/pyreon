import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable } from '../validate'

/**
 * EXECUTE the Kotlin decode of an integer past 2^31.
 *
 * TS `number` has no int/float split and Swift's `Int` is 64-bit, so a source
 * `{ createdAt: number }` holds an epoch-milliseconds value (1.7e12) on iOS.
 * The emit used to lower it to Kotlin's 32-bit `Int`, so the SAME payload threw
 * `Failed to parse int` on Android only. Every typecheck-level gate accepted
 * that (an `Int` field is perfectly valid Kotlin) — the bug is only visible
 * when the emitted data class actually decodes a value, so this compiles the
 * REAL emitted `@Serializable` class with the real kotlinx.serialization
 * compiler plugin and runs it on the JVM.
 *
 * Needs kotlinc + a JVM + kotlinx-serialization jars (found in the Gradle
 * cache, which any Android build populates). Without them the spec is skipped
 * LOUDLY-by-name (`skipped: no serialization jars`) — a machine that cannot run
 * it is not evidence, so the sibling string-level spec (which always runs)
 * pins the same contract on the emit itself.
 */

/** Newest version present for BOTH artifacts, so json and core never mismatch. */
function findJars(): { json: string; core: string } | undefined {
  const root = join(homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'org.jetbrains.kotlinx')
  const jarIn = (artifact: string, version: string): string | undefined => {
    const dir = join(root, artifact, version)
    if (!existsSync(dir)) return undefined
    for (const h of readdirSync(dir)) {
      for (const f of readdirSync(join(dir, h))) if (f === `${artifact}-${version}.jar`) return join(dir, h, f)
    }
    return undefined
  }
  const vdir = join(root, 'kotlinx-serialization-json-jvm')
  if (!existsSync(vdir)) return undefined
  for (const v of readdirSync(vdir).sort().reverse()) {
    const json = jarIn('kotlinx-serialization-json-jvm', v)
    const core = jarIn('kotlinx-serialization-core-jvm', v)
    if (json && core) return { json, core }
  }
  return undefined
}

const PLUGIN = (() => {
  try {
    const bin = realpathSync(execFileSync('which', ['kotlinc'], { encoding: 'utf8' }).trim())
    for (const base of [join(bin, '..', '..', 'lib'), join(bin, '..', '..', 'libexec', 'lib')]) {
      const p = join(base, 'kotlin-serialization-compiler-plugin.jar')
      if (existsSync(p)) return p
    }
  } catch {}
  return undefined
})()
const JARS = findJars()
function javaOk(): boolean {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const canRun = isKotlincAvailable() && javaOk() && PLUGIN !== undefined && JARS !== undefined

const SRC = `
  type Event = { id: number; createdAt: number; name: string }
  export function C() {
    const q = useFetch<Event[]>('http://127.0.0.1:8787/e.json')
    const list = computed(() => q.data() ?? [])
    return <Stack><For each={list} by={(e) => e.id}>{(e) => <Text>{String(e.createdAt)}</Text>}</For></Stack>
  }
`

describe('a TS integer is a 64-bit Long on Kotlin (Swift Int parity)', () => {
  it('the emitted data class declares Long fields, not 32-bit Int', () => {
    const code = transform(SRC, { target: 'kotlin' }).code ?? ''
    expect(code).toContain('data class Event(var id: Long, var createdAt: Long, var name: String)')
    expect(code).not.toMatch(/var (id|createdAt): Int\b/)
  })

  it.runIf(canRun)('EXECUTES: decodes 3000000000 and does arithmetic past 2^31 on the JVM', () => {
    const code = transform(SRC, { target: 'kotlin' }).code ?? ''
    const cls = /@Serializable\ndata class Event\([^\n]*\)/.exec(code)?.[0]
    expect(cls).toBeDefined()
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-int64-'))
    const file = join(dir, 'main.kt')
    const jar = join(dir, 'p.jar')
    writeFileSync(
      file,
      [
        'import kotlinx.serialization.*',
        'import kotlinx.serialization.json.*',
        cls,
        'fun main() {',
        '  val es = Json.decodeFromString<List<Event>>("""[{"id":1,"createdAt":3000000000,"name":"a"},{"id":2,"createdAt":1726000000000,"name":"b"}]""")',
        '  println(es[0].createdAt)',
        '  println(es[1].createdAt + es[0].createdAt)',
        '}',
      ].join('\n'),
    )
    const cp = [JARS!.json, JARS!.core].join(':')
    execFileSync('kotlinc', [file, '-cp', cp, `-Xplugin=${PLUGIN}`, '-include-runtime', '-d', jar], { stdio: 'pipe' })
    const out = execFileSync('java', ['-cp', `${jar}:${cp}`, 'MainKt'], { encoding: 'utf8' }).trim().split('\n')
    expect(out).toEqual(['3000000000', '1729000000000'])
  })
})
