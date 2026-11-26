/**
 * Real-toolchain checks for the `swift` / `kotlin` model plugins.
 *
 * Each check SKIPS when its toolchain is absent, like the rest of Lathe's
 * native tests (`describe.skipIf`). What "present" means:
 *
 *  - Swift: `swiftc` on PATH. The models need only Foundation, so they are
 *    compiled and RUN, not just type-checked.
 *  - Kotlin, full: `kotlinc` and `kotlin` on PATH, the kotlinx.serialization
 *    compiler plugin shipped beside `kotlinc`, and the runtime jars
 *    (`kotlinx-serialization-core-jvm` + `-json-jvm`) from
 *    `PYREON_KOTLINX_SERIALIZATION_CLASSPATH` (path-separated) or the Gradle
 *    cache. Compiled with the real plugin and RUN. Set the variable to `none`
 *    to force the stubbed check below.
 *  - Kotlin, stubbed: `kotlinc` alone. The file is type-checked against a stub
 *    of the kotlinx.serialization API surface it names, so a machine without
 *    the jars still catches a syntax or typing error in the emit.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

function onPath(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'pipe', timeout: 60_000 })
    return true
  } catch {
    return false
  }
}

function which(cmd: string): string | undefined {
  try {
    return execFileSync('/usr/bin/env', ['which', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined
  } catch {
    return undefined
  }
}

let swiftc: boolean | undefined

export function hasSwiftc(): boolean {
  swiftc ??= process.env.PYREON_SKIP_NATIVE_VALIDATE !== '1' && onPath('swiftc', ['--version'])
  return swiftc
}

let kotlinc: boolean | undefined

export function hasKotlinc(): boolean {
  kotlinc ??= process.env.PYREON_SKIP_NATIVE_VALIDATE !== '1' && which('kotlinc') !== undefined
  return kotlinc
}

export interface KotlinxSerialization {
  plugin: string
  classpath: string[]
}

/** The real kotlinx.serialization plugin + runtime, when this machine has them. */
export function kotlinxSerialization(): KotlinxSerialization | undefined {
  if (process.env.PYREON_KOTLINX_SERIALIZATION_CLASSPATH === 'none') return undefined
  if (!hasKotlinc() || which('kotlin') === undefined) return undefined
  const bin = which('kotlinc') as string
  let home: string
  try {
    home = dirname(dirname(realpathSync(bin)))
  } catch {
    return undefined
  }
  const plugin = [
    join(home, 'lib', 'kotlinx-serialization-compiler-plugin.jar'),
    join(home, 'libexec', 'lib', 'kotlinx-serialization-compiler-plugin.jar'),
  ].find((p) => existsSync(p))
  if (!plugin) return undefined
  const fromEnv = process.env.PYREON_KOTLINX_SERIALIZATION_CLASSPATH
  if (fromEnv) return { plugin, classpath: fromEnv.split(delimiter).filter(Boolean) }
  const cache = join(homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'org.jetbrains.kotlinx')
  const jar = (artifact: string, version: string): string | undefined => {
    const dir = join(cache, artifact, version)
    if (!existsSync(dir)) return undefined
    for (const hash of readdirSync(dir)) {
      const p = join(dir, hash, `${artifact}-${version}.jar`)
      if (existsSync(p)) return p
    }

    return undefined
  }
  const versions = (artifact: string): string[] => {
    const dir = join(cache, artifact)
    return existsSync(dir) ? readdirSync(dir) : []
  }
  const json = new Set(versions('kotlinx-serialization-json-jvm'))
  const common = versions('kotlinx-serialization-core-jvm')
    .filter((v) => json.has(v) && /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pb[i] as number) - (pa[i] as number)

      return 0
    })
  for (const v of common) {
    const core = jar('kotlinx-serialization-core-jvm', v)
    const js = jar('kotlinx-serialization-json-jvm', v)
    if (core && js) return { plugin, classpath: [core, js] }
  }

  return undefined
}

export interface RunResult {
  ok: boolean
  output: string
}

function run(cmd: string, args: string[], cwd: string): RunResult {
  try {
    const output = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    return { ok: true, output }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string }
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message }
  }
}

function inTemp<T>(prefix: string, files: Record<string, string>, body: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents)
    return body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** `swiftc -typecheck` the given files (extra flags such as `-swift-version 6`). */
export function swiftTypecheck(files: Record<string, string>, flags: string[] = []): RunResult {
  return inTemp('lathe-swift-tc-', files, (dir) => run('swiftc', ['-typecheck', ...flags, ...Object.keys(files)], dir))
}

/** Compile the files (one must be `main.swift`) and run the program. */
export function swiftRun(files: Record<string, string>): RunResult {
  return inTemp('lathe-swift-run-', files, (dir) => {
    const built = run('swiftc', ['-o', 'app', ...Object.keys(files)], dir)
    if (!built.ok) return built
    return run(join(dir, 'app'), [], dir)
  })
}

/** Compile with the REAL kotlinx.serialization plugin and run `mainClass`. */
export function kotlinRun(files: Record<string, string>, mainClass: string, kx: KotlinxSerialization): RunResult {
  return inTemp('lathe-kotlin-run-', files, (dir) => {
    const cp = kx.classpath.join(delimiter)
    const built = run('kotlinc', ['-nowarn', `-Xplugin=${kx.plugin}`, '-cp', cp, '-d', 'out', ...Object.keys(files)], dir)
    if (!built.ok) return built

    return run('kotlin', ['-cp', [join(dir, 'out'), ...kx.classpath].join(delimiter), mainClass], dir)
  })
}

/**
 * Type-check against a STUB of the kotlinx.serialization surface the emitted
 * file names -- signatures only, no plugin, nothing run. The stub is a subset
 * of the real API with the same names and packages, so code that does not
 * compile against it does not compile against the real library either.
 */
export function kotlinTypecheckStubbed(files: Record<string, string>): RunResult {
  return inTemp('lathe-kotlin-tc-', { ...files, 'KotlinxSerializationStub.kt': KOTLINX_STUB_CORE, 'KotlinxJsonStub.kt': KOTLINX_STUB_JSON, 'KotlinxEncodingStub.kt': KOTLINX_STUB_ENCODING, 'KotlinxDescriptorStub.kt': KOTLINX_STUB_DESCRIPTORS }, (dir) =>
    run('kotlinc', ['-nowarn', '-d', 'out', ...Object.keys(files), 'KotlinxSerializationStub.kt', 'KotlinxJsonStub.kt', 'KotlinxEncodingStub.kt', 'KotlinxDescriptorStub.kt'], dir),
  )
}

const KOTLINX_STUB_CORE = `package kotlinx.serialization
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
@Target(AnnotationTarget.CLASS, AnnotationTarget.PROPERTY, AnnotationTarget.TYPE)
annotation class Serializable(val with: kotlin.reflect.KClass<out KSerializer<*>> = KSerializer::class)
@Target(AnnotationTarget.CLASS, AnnotationTarget.PROPERTY)
annotation class SerialName(val value: String)
interface KSerializer<T> {
  val descriptor: SerialDescriptor
  fun serialize(encoder: Encoder, value: T)
  fun deserialize(decoder: Decoder): T
}
open class SerializationException(message: String? = null) : IllegalArgumentException(message)
`

const KOTLINX_STUB_DESCRIPTORS = `package kotlinx.serialization.descriptors
interface SerialDescriptor
`

const KOTLINX_STUB_ENCODING = `package kotlinx.serialization.encoding
interface Decoder
interface Encoder
`

const KOTLINX_STUB_JSON = `package kotlinx.serialization.json
import kotlinx.serialization.KSerializer
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
abstract class JsonElement {
  companion object { fun serializer(): KSerializer<JsonElement> = TODO() }
}
abstract class JsonPrimitive : JsonElement() {
  abstract val isString: Boolean
  abstract val content: String
}
abstract class JsonObject : JsonElement(), Map<String, JsonElement>
class JsonBuilder { var ignoreUnknownKeys: Boolean = false }
abstract class Json
fun Json(builderAction: JsonBuilder.() -> Unit): Json = TODO()
interface JsonDecoder : Decoder {
  val json: Json
  fun decodeJsonElement(): JsonElement
}
interface JsonEncoder : Encoder {
  val json: Json
  fun encodeJsonElement(element: JsonElement)
}
inline fun <reified T> Json.decodeFromJsonElement(json: JsonElement): T = TODO()
inline fun <reified T> Json.encodeToJsonElement(value: T): JsonElement = TODO()
`
