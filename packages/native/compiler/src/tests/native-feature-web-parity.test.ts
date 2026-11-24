// `@pyreon/feature`'s lowered CRUD hooks behave as the web's `createFetcher` does, on BOTH native targets, in the three
// places a native decode / transport used to differ:
//
//   1. A record that LACKS a schema field: Swift's synthesized `Codable` failed the whole decode while Kotlin filled the
//      field's default. Both now decode it to the field's `initialValues` default ('' / 0 / false); an unknown extra key
//      is ignored on both (as `JSON.parse` keeps-but-ignores it); a present field is decoded strictly on both.
//   2. A 204 on create / update: native failed to decode the empty body; the web resolves `undefined`. Both now settle
//      SUCCESS with no data (`orEmpty`), `onSuccess` firing with the absent value.
//   3. The error: native rejected with a bare status error whose `message` did not even compile. Both now reject with
//      `PyreonHttpMessageError` — the body's `message`, else `<METHOD> <url> failed: <status>`, plus `status` / `errors` —
//      and `error.message` lowers to a read of it.
//
// (1) and (3) are asserted by EXECUTION: the struct the compiler EMITS and the SHIPPED runtime are compiled with swiftc /
// kotlinc and run on the same inputs, and (3) against the corpus the feature package runs through the real web hook.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERROR_API, ERROR_CASES } from '../../../../fundamentals/feature/src/tests/native-error-corpus'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { resolveJava } from '../../../runtime-kotlin/scripts/java-runtime'

/** The `java` that runs jars here (never a bare `java` — see `resolveJava`). */
const JAVA = resolveJava() ?? 'java'

const SWIFT_RUNTIME = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime')
const KOTLIN_RUNTIME = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime')
const KOTLIN_JSON = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonJson.kt')

const API = 'https://api.example.com/todos'

const SRC = `
import { Stack, Text, Button } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'
import { signal } from '@pyreon/reactivity'
export const Todo = defineFeature({
  name: 'todo',
  schema: { id: 'string', title: 'string', done: 'boolean', n: 'number' },
  api: '${API}',
})
export function Todos(props: { id: string }) {
  const list = Todo.useList()
  const one = Todo.useById(() => props.id)
  const create = Todo.useCreate()
  const update = Todo.useUpdate()
  const remove = Todo.useDelete()
  const msg = signal('')
  const add = async () => {
    try {
      const t = await create.mutateAsync({ title: 'x', done: false })
      msg.set(t?.id ?? 'no content')
    } catch (e) {
      msg.set((e as Error).message)
    }
  }
  return (
    <Stack>
      <Text>{list.error()?.message ?? ''}</Text>
      <Text>{one.error()?.message ?? ''}</Text>
      <Text>{create.error()?.message ?? ''}</Text>
      <Text>{msg()}</Text>
      <Button onPress={add}>Add</Button>
      <Button onPress={() => create.mutate({ title: 'y', done: false }, { onSuccess: (t) => msg.set(t?.title ?? 'saved'), onError: (e) => msg.set(e.message) })}>Add 2</Button>
      <Button onPress={() => update.mutate({ id: props.id, data: { done: true } }, { onSuccess: () => msg.set('updated'), onSettled: (d) => msg.set(d?.title ?? '') })}>Done</Button>
      <Button onPress={() => remove.mutate(props.id, { onError: (e) => msg.set(e.message) })}>Delete</Button>
    </Stack>
  )
}
`

const swift = transform(SRC, { target: 'swift' })
const kotlin = transform(SRC, { target: 'kotlin' })

describe('@pyreon/feature CRUD — web parity on iOS and Android (emit)', () => {
  it('lowers without a warning (the mutations refresh the feature queries natively, so no invalidation gap is left to report)', () => {
    for (const r of [swift, kotlin]) expect(r.warnings).toEqual([])
  })

  it('every request rejects with the web helper error, naming the URL as the web message does (the id raw)', () => {
    const sw = swift.code
    const kt = kotlin.code
    for (const [method, url] of [
      ['GET', `"${API}"`],
      ['GET', `"${API}/\\(id)"`],
      ['POST', `"${API}"`],
      ['PUT', `"${API}/\\(id)"`],
      ['DELETE', `"${API}/\\(id)"`],
    ] as const) {
      expect(sw).toContain(`[.reject { $0.messageError(method: "${method}", url: ${url}) }] as [PyreonHttpMiddleware]`)
    }
    for (const [method, url] of [
      ['GET', `"${API}"`],
      ['GET', `"${API}/\${id}"`],
      ['POST', `"${API}"`],
      ['PUT', `"${API}/\${id}"`],
      ['DELETE', `"${API}/\${id}"`],
    ] as const) {
      expect(kt).toContain(`listOf<PyreonHttpMiddleware>(PyreonHttpMiddleware.Reject { it.messageError("${method}", ${url}) })`)
    }
  })

  it('create / update settle a 204 as success with no data; delete decodes nothing', () => {
    const sw = swift.code
    const kt = kotlin.code
    expect(sw).toContain('try await create.mutateAsync(PyreonHttpRequest(method: .post')
    expect(sw).toMatch(/create\.mutateAsync\([^\n]*orEmpty: \{ __request in [^\n]*return try __response\.status == 204 \? nil : __response\.decode\(PyreonFeatureSchema_Todo\.self\) \} \}/)
    expect(sw).toMatch(/update\.mutate\([^\n]*orEmpty: \{ __input in [^\n]*__response\.status == 204 \? nil/)
    expect(sw).toContain('call: PyreonMutationCallbacksOrEmpty(onSuccess: { t in')
    expect(sw).not.toMatch(/remove\.mutate\([^\n]*orEmpty/)
    expect(kt).toMatch(/create\.runAsyncOrEmpty\([^\n]*if \(__response\.status == 204\) null else PyreonJson\.decode<PyreonFeatureSchema_Todo>\(__response\.body\)/)
    expect(kt).toMatch(/update\.runOrEmpty\(__mine, __request/)
    expect(kt).toContain('call = PyreonMutationCallbacksOrEmpty<PyreonFeatureSchema_Todo>(onSuccess = { t ->')
    expect(kt).toMatch(/remove\.run\(__mine, __request/)
  })

  it('`error.message` lowers to a read of the error message on both targets', () => {
    expect(swift.code).toContain('Text(verbatim: "\\((list.error.map { pyreonErrorMessage($0) } ?? ""))")')
    expect(swift.code).toContain('create.error.map { pyreonErrorMessage($0) }')
    expect(swift.code).toMatch(/onError: \{ e in\n\s*msg = pyreonErrorMessage\(e\)/)
    expect(kotlin.code).toContain('list.error.value?.let { pyreonErrorMessage(it) }')
    expect(kotlin.code).toMatch(/onError = \{ e ->\n\s*msg = pyreonErrorMessage\(e\)/)
  })

  it('the Swift schema struct decodes an absent field to its default (an extension, so `init()` stays)', () => {
    expect(swift.code).toContain(
      [
        'extension PyreonFeatureSchema_Todo {',
        '    init(from decoder: Decoder) throws {',
        '        let c = try decoder.container(keyedBy: CodingKeys.self)',
        '        self.init()',
        '        if c.contains(.id) { self.id = try c.decode(String.self, forKey: .id) }',
      ].join('\n'),
    )
    expect(swift.code).toContain('static let initialValues = PyreonFeatureSchema_Todo()')
  })

  it.runIf(isSwiftcAvailable())('the Swift output type-checks against the stubs', () => {
    const v = validateSwiftWithStubs(swift.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('the Kotlin output compiles against the stubs', () => {
    const v = validateKotlin(kotlin.code)
    expect(v.ok, v.error).toBe(true)
  })
})

// ── Execution ─────────────────────────────────────────────────────────────────

/** A JDK to run the jar — commonly off PATH under Homebrew. */
function jvmPath(): string | undefined {
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java']) {
    if (existsSync(c)) return c
  }
  try {
    execFileSync(JAVA, ['-version'], { stdio: 'ignore' })
    return JAVA
  } catch {
    return undefined
  }
}

/** The REAL kotlinx-serialization jars (local Gradle cache) + the compiler plugin kotlinc ships; undefined skips by name. */
function kotlinxToolchain(): { classpath: string; plugin: string; stdlib: string } | undefined {
  if (!isKotlincAvailable()) return undefined
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
  if (!existsSync(plugin) || !existsSync(stdlib)) return undefined
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
  const core = jar('kotlinx-serialization-core-jvm', '1.9.0')
  const json = jar('kotlinx-serialization-json-jvm', '1.9.0')
  if (core === undefined || json === undefined) return undefined

  return { classpath: `${core}:${json}`, plugin, stdlib }
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')
const unb64 = (s: string): string => Buffer.from(s, 'base64').toString('utf8')

/** `status \t base64(body)` per line — no escaping questions between the two harnesses. */
const errorInput = (): string => ERROR_CASES.map((c) => `${c.status}\t${b64(c.body)}`).join('\n')

/** What each case must print: `base64(message) base64(errors)|-`. */
const errorExpected = (): string[] => ERROR_CASES.map((c) => `${b64(c.message)} ${c.errors === undefined ? '-' : b64(c.errors)}`)

const SWIFT_ERROR_MAIN = (input: string) => `import Foundation
let text = try! String(contentsOfFile: ${JSON.stringify(input)}, encoding: .utf8)
for line in text.split(separator: "\\n", omittingEmptySubsequences: false) {
    let parts = line.split(separator: "\\t", omittingEmptySubsequences: false)
    let body = Data(base64Encoded: String(parts[1]))!
    let e = PyreonHttpResponse(status: Int(parts[0])!, body: body).messageError(method: "POST", url: ${JSON.stringify(ERROR_API)})
    let errors = e.errors.map { Data($0.utf8).base64EncodedString() } ?? "-"
    print("\\(Data(e.message.utf8).base64EncodedString()) \\(errors)")
}
`

const KOTLIN_ERROR_MAIN = (input: string) => `import com.pyreon.runtime.PyreonHttpResponse
import com.pyreon.runtime.messageError
import java.util.Base64

fun main() {
    val enc = Base64.getEncoder()
    val out = StringBuilder()
    for (line in java.io.File(${JSON.stringify(input)}).readText(Charsets.UTF_8).split("\\n")) {
        val parts = line.split("\\t")
        val body = String(Base64.getDecoder().decode(parts[1]), Charsets.UTF_8)
        val e = PyreonHttpResponse(parts[0].toInt(), body = body).messageError("POST", ${JSON.stringify(ERROR_API)})
        val errors = e.errors?.let { enc.encodeToString(it.toByteArray(Charsets.UTF_8)) } ?: "-"
        out.append(enc.encodeToString(e.message!!.toByteArray(Charsets.UTF_8))).append(' ').append(errors).append('\\n')
    }
    print(out)
}
`

describe('the error a CRUD request rejects with — the SHIPPED runtimes against the web corpus', () => {
  it('the corpus covers what it claims to', () => {
    expect(ERROR_CASES.some((c) => c.errors !== undefined)).toBe(true)
    expect(ERROR_CASES.some((c) => c.message.startsWith('POST '))).toBe(true)
    expect(ERROR_CASES.some((c) => [...c.message].some((ch) => (ch.codePointAt(0) ?? 0) > 0x7f))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift `messageError` reads every body as the web does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-feature-err-swift-'))
    try {
      writeFileSync(join(dir, 'cases.txt'), errorInput())
      writeFileSync(join(dir, 'main.swift'), SWIFT_ERROR_MAIN(join(dir, 'cases.txt')))
      execFileSync(
        'swiftc',
        [join(SWIFT_RUNTIME, 'PyreonHttp.swift'), join(SWIFT_RUNTIME, 'PyreonJSON.swift'), join(dir, 'main.swift'), '-o', join(dir, 'run')],
        { stdio: 'pipe' },
      )
      const out = execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n').slice(0, -1)
      expect(out.map((l) => l.split(' ').map((p) => (p === '-' ? p : unb64(p))))).toEqual(
        errorExpected().map((l) => l.split(' ').map((p) => (p === '-' ? p : unb64(p)))),
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)('Kotlin `messageError` reads every body as the web does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-feature-err-kotlin-'))
    try {
      writeFileSync(join(dir, 'cases.txt'), errorInput())
      writeFileSync(join(dir, 'Main.kt'), KOTLIN_ERROR_MAIN(join(dir, 'cases.txt')))
      execFileSync('kotlinc', ['-nowarn', join(KOTLIN_RUNTIME, 'PyreonHttp.kt'), join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'run.jar')], {
        stdio: 'pipe',
      })
      const out = execFileSync(jvmPath() as string, ['-cp', join(dir, 'run.jar'), 'MainKt']).toString('utf8').split('\n').slice(0, -1)
      expect(out.map((l) => l.split(' ').map((p) => (p === '-' ? p : unb64(p))))).toEqual(
        errorExpected().map((l) => l.split(' ').map((p) => (p === '-' ? p : unb64(p)))),
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)
})

/** Records, as JSON, and what decoding each into `[PyreonFeatureSchema_Todo]` must print on BOTH targets. */
const DECODE_CASES: readonly { name: string; json: string; expected: string }[] = [
  { name: 'every field', json: '[{"id":"1","title":"t","done":true,"n":3}]', expected: '1|t|true|3' },
  { name: 'a missing field takes its default', json: '[{"id":"1","done":true,"n":3}]', expected: '1||true|3' },
  { name: 'every field missing', json: '[{}]', expected: '||false|0' },
  {
    name: 'an unknown key is ignored',
    json: '[{"id":"1","title":"t","done":false,"n":2,"extra":{"deep":[1,"x"]}}]',
    expected: '1|t|false|2',
  },
  { name: 'records mixing present and missing fields', json: '[{"id":"a","n":1},{"title":"b","done":true}]', expected: 'a||false|1;|b|true|0' },
  { name: 'an explicit null is a decode error', json: '[{"id":"1","title":null}]', expected: 'error' },
  { name: 'a wrong-typed field is a decode error', json: '[{"id":1}]', expected: 'error' },
]

const swiftStruct = (): string => {
  const code = swift.code
  const start = code.indexOf('struct PyreonFeatureSchema_Todo: Codable {')
  const end = code.indexOf('enum PyreonFeature_Todo {')

  return code.slice(start, end)
}

const kotlinStruct = (): string => {
  const m = /@Serializable\ndata class PyreonFeatureSchema_Todo\([^)]*\)/.exec(kotlin.code)
  return m?.[0] ?? ''
}


describe('a record missing a schema field — the EMITTED struct on both targets', () => {
  it('the emitted declarations and the shipped decoder are where the test reads them', () => {
    expect(swiftStruct()).toContain('init(from decoder: Decoder) throws {')
    expect(kotlinStruct()).toContain('var title: String = ""')
    // The Kotlin emit decodes every record through the shipped `PyreonJson.decode`, which the Kotlin case compiles in.
    expect(kotlin.code).toContain('PyreonJson.decode<PyreonFeatureSchema_Todo>(')
  })

  it.skipIf(!isSwiftcAvailable())('Swift decodes every case as the table says', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-feature-decode-swift-'))
    try {
      writeFileSync(join(dir, 'cases.json'), JSON.stringify(DECODE_CASES.map((c) => c.json)))
      writeFileSync(
        join(dir, 'main.swift'),
        `import Foundation
${swiftStruct()}
let cases = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: ${JSON.stringify(join(dir, 'cases.json'))}))) as! [String]
for json in cases {
    if let rows = try? JSONDecoder().decode([PyreonFeatureSchema_Todo].self, from: Data(json.utf8)) {
        print(rows.map { "\\($0.id)|\\($0.title)|\\($0.done)|\\($0.n)" }.joined(separator: ";"))
    } else {
        print("error")
    }
}
`,
      )
      execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      const out = execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n').slice(0, -1)
      expect(out).toEqual(DECODE_CASES.map((c) => c.expected))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  const kx = kotlinxToolchain()
  it.skipIf(kx === undefined || jvmPath() === undefined)('Kotlin decodes every case as the table says (real kotlinx-serialization)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-feature-decode-kotlin-'))
    try {
      writeFileSync(join(dir, 'cases.txt'), DECODE_CASES.map((c) => b64(c.json)).join('\n'))
      writeFileSync(
        join(dir, 'Main.kt'),
        `import kotlinx.serialization.Serializable
import com.pyreon.runtime.PyreonJson

${kotlinStruct()}

fun main() {
    for (line in java.io.File(${JSON.stringify(join(dir, 'cases.txt'))}).readText().split("\\n")) {
        val json = String(java.util.Base64.getDecoder().decode(line), Charsets.UTF_8)
        val out = try {
            PyreonJson.decode<List<PyreonFeatureSchema_Todo>>(json).joinToString(";") { "\${it.id}|\${it.title}|\${it.done}|\${it.n}" }
        } catch (e: Exception) {
            "error"
        }
        println(out)
    }
}
`,
      )
      execFileSync(
        'kotlinc',
        ['-nowarn', `-Xplugin=${kx!.plugin}`, '-cp', kx!.classpath, join(dir, 'Main.kt'), KOTLIN_JSON, '-d', join(dir, 'out')],
        { stdio: 'pipe' },
      )
      const out = execFileSync(jvmPath() as string, ['-cp', `${join(dir, 'out')}:${kx!.classpath}:${kx!.stdlib}`, 'MainKt'])
        .toString('utf8')
        .split('\n')
        .slice(0, -1)
      expect(out).toEqual(DECODE_CASES.map((c) => c.expected))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)
})
