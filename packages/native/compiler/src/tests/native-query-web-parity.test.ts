// `@pyreon/query`, `@pyreon/http` and `useFetch` behave as the web does on BOTH native targets, in three places:
//
//   1. An answer WITHOUT JSON (a 204). The web defines it per path, and each is mirrored, not generalized:
//      - `useQuery(() => ep.query(…))`: `@pyreon/http`'s `.json()` resolves `undefined`, and TanStack FAILS the query with
//        `<queryHash> data is undefined` → natively `PyreonQueryDataUndefined(queryHash:)`, the hash emitted from the
//        web key (`[keyScope?, method, path, { params?, query? }]`, object keys sorted). `@pyreon/feature`'s `useList` /
//        `useById` likewise (their fetcher resolves `undefined` for a 204).
//      - `useFetch(ep(…))`, an awaited endpoint call, a `useMutation` over an endpoint: `undefined` is a SUCCESS with no
//        data → `resolveEmpty()` / the mutation's `orEmpty` path (`__response.isNoContent`: 204 / 205 / 304 / empty).
//      - `useFetch(url)` and an inline `fetch` queryFn: `res.json()` throws an engine-specific SyntaxError on the web —
//        a failure on every target already, with no message to match; unchanged.
//   2. The error MESSAGE. `@pyreon/http` rejects with `HttpError` (`[Pyreon] <METHOD> <url> — HTTP <status>`, URL
//      redacted, named `ClientError` / `ServerError`): every lowered endpoint request runs through the client's
//      `throwHttpErrors` layer (`.throwHttpErrors` / `ThrowHttpErrors`), outermost. `useFetch(url)` rejects with
//      `[Pyreon] useFetch <url>: HTTP <status>`. `q.error()?.message` now lowers for `useQuery` too.
//   3. `useQueryClient().invalidateQueries({ queryKey, exact })` and `useMutation({ invalidates })` lower onto
//      `PyreonQueryCache`, with every key part the colon-joined native key cannot hold faithfully refused by name.
//
// (2) and the hashes of (1) are asserted by EXECUTION against the corpus the web packages run through their real code
// (`@pyreon/http`'s `native-error-corpus.ts`, `@pyreon/hooks`' `native-fetch-error-corpus.ts`): the shipped Swift / Kotlin runtimes, and the emitted hash expression
// compiled with the shipped `PyreonJSON` / `PyreonJson`.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FETCH_ERROR_CASES } from '../../../../fundamentals/hooks/src/__tests__/native-fetch-error-corpus'
import {
  HTTP_ERROR_CASES,
  UNDEFINED_DATA_CASES,
  type UndefinedDataCase,
} from '../../../../fundamentals/http/src/tests/native-error-corpus'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SWIFT_RUNTIME = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime')
const KOTLIN_RUNTIME = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime')

const SRC = `
import { Stack, Text, Button } from '@pyreon/primitives'
import { useQuery, useMutation, useQueryClient } from '@pyreon/query'
import { useFetch } from '@pyreon/hooks'
import { createHttp } from '@pyreon/http'
import { signal } from '@pyreon/reactivity'
const api = createHttp({ baseUrl: 'https://api.example.com' })
const getUser = api.endpoint('GET /users/:id')
const saveUser = api.endpoint('POST /users')
const removeUser = api.endpoint('DELETE /users/:id')
type User = { id: string; name: string }
export function Users(props: { id: string }) {
  const user = useQuery<User>(() => getUser.query({ params: { id: props.id } }))
  const list = useQuery<User[]>(() => ({ queryKey: ['users', 'list'], queryFn: () => fetch('https://api.example.com/users').then((r) => r.json()) }))
  const one = useFetch<User>(getUser({ params: { id: '1' } }))
  const quotes = useFetch<User>('https://api.example.com/quotes.json')
  const qc = useQueryClient()
  const save = useMutation<User>({
    mutationFn: (v: User) => saveUser({ json: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
  // \`User | undefined\`: a 204 settles as success with no data, as the web's \`.json()\` resolves \`undefined\`.
  const add = useMutation<User | undefined>({ ...saveUser.mutation(), invalidates: [['users', 'list'], ['user', props.id]] })
  const msg = signal('')
  const go = async () => {
    try {
      await removeUser({ params: { id: props.id } })
      qc.invalidateQueries({ queryKey: ['user', props.id], exact: true })
      qc.invalidateQueries()
    } catch (e) {
      msg.set(e.message)
    }
  }
  return (
    <Stack>
      <Text>{user.error()?.message ?? ''}</Text>
      <Text>{list.error()?.message ?? ''}</Text>
      <Text>{one.error()?.message ?? ''}</Text>
      <Text>{quotes.error()?.message ?? ''}</Text>
      <Text>{save.error()?.message ?? ''}</Text>
      <Text>{msg()}</Text>
      <Button onPress={() => save.mutate({ id: '1', name: 'n' }, { onSuccess: (u) => msg.set(u.name) })}>Save</Button>
      <Button onPress={() => add.mutate({ json: { id: '2', name: 'm' } }, { onSuccess: (u) => msg.set(u?.name ?? 'saved') })}>Add</Button>
      <Button onPress={go}>Remove</Button>
    </Stack>
  )
}
`

const swift = transform(SRC, { target: 'swift' })
const kotlin = transform(SRC, { target: 'kotlin' })

describe('@pyreon/query / @pyreon/http / useFetch — web parity on iOS and Android (emit)', () => {
  it('lowers without a warning', () => {
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('every endpoint request runs through the client\'s `throwHttpErrors` layer — the web\'s HttpError', () => {
    // useQuery(ep.query), useFetch(ep(…)), a useMutation over an endpoint, an awaited call: all of them.
    expect(swift.code.match(/middleware: \[\.throwHttpErrors\] as \[PyreonHttpMiddleware\]/g)?.length).toBe(5)
    expect(kotlin.code.match(/middleware = listOf<PyreonHttpMiddleware>\(PyreonHttpMiddleware\.ThrowHttpErrors\)/g)?.length).toBe(5)
    expect(swift.code).toContain('try await PyreonHttp.call(PyreonHttpRequest(method: .delete, url: "https://api.example.com/users/\\(PyreonURL.encodePathParam(id))"), middleware: [.throwHttpErrors] as [PyreonHttpMiddleware])')
    expect(kotlin.code).toContain('PyreonHttp.call(__request, fallback = PyreonHttpOkHttp, middleware = listOf<PyreonHttpMiddleware>(PyreonHttpMiddleware.ThrowHttpErrors))')
  })

  it('useFetch(url) rejects with the web hook\'s own error, through PyreonHttp on both targets', () => {
    expect(swift.code).toContain('middleware: [.reject { $0.fetchError(url: "https://api.example.com/quotes.json") }] as [PyreonHttpMiddleware]')
    expect(kotlin.code).toContain('PyreonHttp.send(PyreonHttpRequest(method = PyreonHttpMethod.GET, url = "https://api.example.com/quotes.json"), fallback = PyreonHttpOkHttp, middleware = listOf<PyreonHttpMiddleware>(PyreonHttpMiddleware.Reject { it.fetchError("https://api.example.com/quotes.json") }))')
    expect(swift.code).not.toContain('URLSession.shared.data(from: URL(string: "https://api.example.com/quotes.json")')
    expect(kotlin.code).not.toContain('readText()')
  })

  it('a 204 on an endpoint query fails it with TanStack\'s error; on useFetch(ep) and a mutation admitting `undefined` it is success with no data', () => {
    expect(swift.code).toContain('if __response.isNoContent {\n            throw PyreonQueryDataUndefined(queryHash: "[\\"GET\\",\\"/users/:id\\",{\\"params\\":{\\"id\\":\\(PyreonJSON.stringify(id))}}]")')
    expect(kotlin.code).toContain('if (__response.isNoContent) throw PyreonQueryDataUndefined("[\\"GET\\",\\"/users/:id\\",{\\"params\\":{\\"id\\":${PyreonJson.stringify(id)}}}]")')
    expect(swift.code).toContain('if __response.isNoContent { one.resolveEmpty() } else { one.resolve(try __response.decode(User.self)) }')
    expect(kotlin.code).toContain('if (__response.isNoContent) one.resolveEmpty() else one.resolve(')
    expect(swift.code).toContain('return try __response.isNoContent ? nil : __response.decode(User.self)')
    expect(kotlin.code).toContain('if (__response.isNoContent) null else PyreonFetchJson.decodeFromString<User>(__response.body)')
    // A 204 resolves `add` with no data, so its callbacks take the optional value.
    expect(swift.code).toContain('@State private var add = PyreonMutation<User>()')
    expect(swift.code).toMatch(/add\.mutate\([^\n]*orEmpty: [\s\S]*?\}\), call: PyreonMutationCallbacksOrEmpty\(onSuccess: \{ u in/)
    expect(kotlin.code).toMatch(/add\.runOrEmpty\(/)
    // `save` declares a value (\`User\`): its data stays non-optional, and a 204 is a decode error natively — the web
    // would hand \`u.name\` an \`undefined\` the type ruled out.
    expect(swift.code).toMatch(/save\.mutate\([^\n]*, \{ __request in let __response[^\n]*return try __response\.decode\(User\.self\) \}, options: [\s\S]*?\}\), call: PyreonMutationCallbacks\(onSuccess: \{ u in/)
  })

  it('`error()?.message` reads the error\'s message for every container', () => {
    for (const n of ['user', 'list', 'one', 'quotes', 'save']) {
      expect(swift.code).toContain(`${n}.error.map { pyreonErrorMessage($0) }`)
      expect(kotlin.code).toContain(`${n}.error.value?.let { pyreonErrorMessage(it) }`)
    }
  })

  it('invalidateQueries / invalidates lower onto PyreonQueryCache with the native key semantics', () => {
    expect(swift.code).toContain('PyreonQueryCache.shared.invalidateQueries("users")')
    expect(swift.code).toContain('PyreonQueryCache.shared.invalidateQueries("user:\\(id)", exact: true)')
    expect(swift.code).toContain('PyreonQueryCache.shared.invalidateAllQueries()')
    expect(kotlin.code).toContain('PyreonQueryCache.invalidateQueries("users")')
    expect(kotlin.code).toContain('PyreonQueryCache.invalidateQueries("user:${id}", exact = true)')
    expect(kotlin.code).toContain('PyreonQueryCache.invalidateAllQueries()')
    // `invalidates` runs on success, BEFORE the author's onSuccess, one call per key.
    expect(swift.code).toMatch(/PyreonQueryCache\.shared\.invalidateQueries\("users:list"\)\nPyreonQueryCache\.shared\.invalidateQueries\("user:\\\(id\)"\)/)
    expect(kotlin.code).toMatch(/PyreonQueryCache\.invalidateQueries\("users:list"\)\nPyreonQueryCache\.invalidateQueries\("user:\$\{id\}"\)/)
    // The client binding emits nothing.
    expect(swift.code).not.toMatch(/\bqc\b/)
    expect(kotlin.code).not.toMatch(/\bqc\b/)
  })

  it.runIf(isSwiftcAvailable())('the Swift output type-checks against the stubs', () => {
    const v = validateSwiftWithStubs(swift.code)
    expect(v.ok, v.error).toBe(true)
  }, 180_000)

  it.runIf(isKotlincAvailable())('the Kotlin output compiles against the stubs', () => {
    const v = validateKotlin(kotlin.code)
    expect(v.ok, v.error).toBe(true)
  }, 180_000)
})

/** One component calling `invalidateQueries` with `call`, compiled for Swift; its warnings. */
const invalidationWarnings = (call: string, extra = ''): string[] =>
  transform(
    `
import { Button } from '@pyreon/primitives'
import { useQueryClient, useMutation } from '@pyreon/query'
import { createHttp } from '@pyreon/http'
const api = createHttp({ baseUrl: 'https://a.dev' })
const save = api.endpoint('POST /x')
export function C(props: { id: string; flag: boolean }) {
  const qc = useQueryClient()
  ${extra}
  return <Button onPress={() => { ${call} }}>Go</Button>
}
`,
    { target: 'swift' },
  ).warnings

describe('invalidateQueries — what the native key cannot hold is refused BY NAME', () => {
  it('a part holding `:` (the native key joins parts with `:`)', () => {
    expect(invalidationWarnings("qc.invalidateQueries({ queryKey: ['a:b'] })").join('\n')).toMatch(/holds `:`.*\['a', 'b'\]/)
  })

  it('an @pyreon/http endpoint key (keyed natively by METHOD:url)', () => {
    expect(invalidationWarnings("qc.invalidateQueries({ queryKey: ['GET', '/users/:id'] })").join('\n')).toMatch(/endpoint queries, which are keyed natively by their resolved `METHOD:url`/)
  })

  it('an object / boolean part (matched structurally on the web)', () => {
    expect(invalidationWarnings("qc.invalidateQueries({ queryKey: ['todo', { done: true }] })").join('\n')).toMatch(/object, array, boolean/)
    expect(invalidationWarnings("qc.invalidateQueries({ queryKey: ['todo', props.flag] })").join('\n')).toMatch(/not a string or a number/)
  })

  it('a filter with no native counterpart', () => {
    expect(invalidationWarnings("qc.invalidateQueries({ queryKey: ['t'], refetchType: 'none' })").join('\n')).toMatch(/`refetchType` filter does not lower/)
    expect(invalidationWarnings("qc.invalidateQueries({ queryKey: ['t'], predicate: () => true })").join('\n')).toMatch(/`predicate` filter does not lower/)
    expect(invalidationWarnings("qc.invalidateQueries({ queryKey: ['t'], refetchType: 'active' })")).toEqual([])
  })

  it('the wait the web does on an awaited / returned invalidation', () => {
    expect(invalidationWarnings('', "const m = useMutation({ mutationFn: (v: { a: number }) => save({ json: v }), onSuccess: () => qc.invalidateQueries({ queryKey: ['t'] }) })").join('\n')).toMatch(/waits for the refetches it starts/)
    // A statement in a block body returns nothing: the web does not wait, and nothing is reported.
    expect(invalidationWarnings('', "const m = useMutation({ mutationFn: (v: { a: number }) => save({ json: v }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['t'] }) } })")).toEqual([])
  })

  it('every other client method is named, never emitted as a call nothing declares', () => {
    expect(invalidationWarnings("qc.setQueryData(['t'], 1)").join('\n')).toMatch(/`qc\.setQueryData\(…\)`.*only `invalidateQueries` lowers/)
  })

  it('an `invalidates` key that cannot be held is named on the option', () => {
    expect(
      invalidationWarnings('', "const m = useMutation({ mutationFn: (v: { a: number }) => save({ json: v }), invalidates: [['GET', '/x']] })").join('\n'),
    ).toMatch(/option `invalidates` is IGNORED on iOS and Android: a key that starts with `'GET'`/)
  })
})

// ── Execution ─────────────────────────────────────────────────────────────────

/** A JDK to run the jar — commonly off PATH under Homebrew. */
function jvmPath(): string | undefined {
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

/** The REAL kotlinx-serialization jars (local Gradle cache) + the compiler plugin kotlinc ships; undefined skips by name. */
function kotlinxToolchain(): { classpath: string; plugin: string } | undefined {
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
  const core = jar('kotlinx-serialization-core-jvm', '1.9.0')
  const json = jar('kotlinx-serialization-json-jvm', '1.9.0')
  if (core === undefined || json === undefined) return undefined
  return { classpath: `${core}:${json}`, plugin }
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')
const unb64 = (s: string): string => Buffer.from(s, 'base64').toString('utf8')
const decodeLines = (out: string): string[][] => out.split('\n').slice(0, -1).map((l) => l.split(' ').map(unb64))

/** `kind \t status \t base64(method) \t base64(url)` per line. */
const errorInput = (): string =>
  [
    ...HTTP_ERROR_CASES.map((c) => `http\t${c.status}\t${b64(c.spec.split(' ')[0] as string)}\t${b64(c.sentUrl)}`),
    ...FETCH_ERROR_CASES.map((c) => `fetch\t${c.status}\t${b64('GET')}\t${b64(c.url)}`),
  ].join('\n')

/** What each line must print: `base64(message) base64(name)`. */
const errorExpected = (): string[][] => [
  ...HTTP_ERROR_CASES.map((c) => [c.message, c.errorName]),
  ...FETCH_ERROR_CASES.map((c) => [c.message, 'Error']),
]

const SWIFT_ERROR_MAIN = (input: string) => `import Foundation
let text = try! String(contentsOfFile: ${JSON.stringify(input)}, encoding: .utf8)
func b(_ s: Substring) -> String { String(data: Data(base64Encoded: String(s))!, encoding: .utf8)! }
func e(_ s: String) -> String { Data(s.utf8).base64EncodedString() }
for line in text.split(separator: "\\n") {
    let p = line.split(separator: "\\t", omittingEmptySubsequences: false)
    let response = PyreonHttpResponse(status: Int(p[1])!, body: Data("{\\"message\\":\\"not read\\"}".utf8))
    // Through the middleware the emit sends with: the layer builds the error from the request as sent.
    let request = PyreonHttpRequest(method: PyreonHttpMethod(rawValue: b(p[2]))!, url: b(p[3]))
    let layer: PyreonHttpMiddleware = p[0] == "http" ? .throwHttpErrors : .reject { $0.fetchError(url: b(p[3])) }
    let done = DispatchSemaphore(value: 0)
    Task {
        do {
            _ = try await PyreonHttpPipeline.run(request, middleware: [layer]) { _ in response }
            print("bm8= bm8=")
        } catch let error as PyreonHttpMessageError {
            print("\\(e(error.message)) \\(e(error.name))")
        } catch {
            // Any other error is a mismatch, printed rather than left to hang the semaphore.
            print("\\(e(String(describing: error))) \\(e("?"))")
        }
        done.signal()
    }
    done.wait()
}
`

const KOTLIN_ERROR_MAIN = (input: string) => `import com.pyreon.runtime.*
import java.util.Base64

fun main() {
    val enc = Base64.getEncoder()
    fun b(s: String) = String(Base64.getDecoder().decode(s), Charsets.UTF_8)
    fun e(s: String) = enc.encodeToString(s.toByteArray(Charsets.UTF_8))
    val out = StringBuilder()
    for (line in java.io.File(${JSON.stringify(input)}).readText(Charsets.UTF_8).split("\\n")) {
        val p = line.split("\\t")
        val response = PyreonHttpResponse(p[1].toInt(), body = "{\\"message\\":\\"not read\\"}")
        val request = PyreonHttpRequest(PyreonHttpMethod.valueOf(b(p[2])), b(p[3]))
        val layer: PyreonHttpMiddleware = if (p[0] == "http") PyreonHttpMiddleware.ThrowHttpErrors else PyreonHttpMiddleware.Reject { it.fetchError(b(p[3])) }
        try {
            PyreonHttpPipeline.run(request, listOf(layer)) { response }
            out.append("bm8= bm8=\\n")
        } catch (err: PyreonHttpMessageError) {
            out.append(e(err.message!!)).append(' ').append(e(err.name)).append('\\n')
        } catch (err: Throwable) {
            out.append(e(err.toString())).append(' ').append(e("?")).append('\\n')
        }
    }
    print(out)
}
`

describe('the error a request rejects with — the SHIPPED runtimes against the web corpus', () => {
  it('the corpus covers what it claims to', () => {
    expect(new Set(HTTP_ERROR_CASES.map((c) => c.errorName))).toEqual(new Set(['ClientError', 'ServerError', 'HttpError']))
    expect(HTTP_ERROR_CASES.some((c) => c.sentUrl.includes('?') && !c.message.includes('?'))).toBe(true)
    expect(HTTP_ERROR_CASES.some((c) => c.sentUrl.includes('@') && !c.message.includes('@'))).toBe(true)
    expect(FETCH_ERROR_CASES.some((c) => c.url.includes('?') && c.message.includes('?'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: `.throwHttpErrors` and `fetchError` give the web message and name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-query-err-swift-'))
    try {
      writeFileSync(join(dir, 'cases.txt'), errorInput())
      writeFileSync(join(dir, 'main.swift'), SWIFT_ERROR_MAIN(join(dir, 'cases.txt')))
      execFileSync(
        'swiftc',
        [join(SWIFT_RUNTIME, 'PyreonHttp.swift'), join(SWIFT_RUNTIME, 'PyreonJSON.swift'), join(dir, 'main.swift'), '-o', join(dir, 'run')],
        { stdio: 'pipe' },
      )
      expect(decodeLines(execFileSync(join(dir, 'run'), { encoding: 'utf8' }))).toEqual(errorExpected())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)('Kotlin: `ThrowHttpErrors` and `fetchError` give the web message and name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-query-err-kotlin-'))
    try {
      writeFileSync(join(dir, 'cases.txt'), errorInput())
      writeFileSync(join(dir, 'Main.kt'), KOTLIN_ERROR_MAIN(join(dir, 'cases.txt')))
      execFileSync('kotlinc', ['-nowarn', join(KOTLIN_RUNTIME, 'PyreonHttp.kt'), join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'run.jar')], {
        stdio: 'pipe',
      })
      expect(decodeLines(execFileSync(jvmPath() as string, ['-cp', join(dir, 'run.jar'), 'MainKt']).toString('utf8'))).toEqual(errorExpected())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)
})

/** One undefined-data case as a source file: the endpoint, its client, and a query reading `props`. */
const undefinedDataSource = (c: UndefinedDataCase): string => `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
import { createHttp } from '@pyreon/http'
const api = createHttp({ baseUrl: 'https://api.example.com'${c.clientKeyScope !== undefined ? `, keyScope: '${c.clientKeyScope}'` : ''} })
const ep = api.endpoint('${c.spec}'${c.endpointKeyScope !== undefined ? `, { keyScope: '${c.endpointKeyScope}' }` : ''})
type R = { id: string }
export function C(props: { id: string; n: number }) {
  const q = useQuery<R>(() => ep.query(${c.args ?? ''}))
  return <Text>{q.error()?.message ?? ''}</Text>
}
`

/** The hash expression a case's query throws with, as emitted. */
function emittedHash(c: UndefinedDataCase, target: 'swift' | 'kotlin'): string {
  const r = transform(undefinedDataSource(c), { target })
  expect(r.warnings, c.name).toEqual([])
  const m = target === 'swift' ? /throw PyreonQueryDataUndefined\(queryHash: (.*)\)\n/.exec(r.code) : /throw PyreonQueryDataUndefined\((.*)\)\n/.exec(r.code)
  expect(m, `${c.name}: no undefined-data throw in the ${target} emit`).not.toBeNull()
  return (m as RegExpExecArray)[1] as string
}

describe('a 204 fails an endpoint query with the web\'s `<queryHash> data is undefined` — the emitted hash, executed', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: every corpus key hashes as TanStack hashes it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-query-hash-swift-'))
    try {
      const blocks = UNDEFINED_DATA_CASES.map(
        (c) => `do {\n    let id: String = ${JSON.stringify(c.props.id)}\n    let n: Double = ${c.props.n}\n    _ = (id, n)\n    print(Data(PyreonQueryDataUndefinedMessage(${emittedHash(c, 'swift')}).utf8).base64EncodedString())\n}`,
      )
      writeFileSync(
        join(dir, 'main.swift'),
        `import Foundation\nfunc PyreonQueryDataUndefinedMessage(_ hash: String) -> String { "\\(hash) data is undefined" }\n${blocks.join('\n')}\n`,
      )
      execFileSync('swiftc', [join(SWIFT_RUNTIME, 'PyreonJSON.swift'), join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      const out = execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n').slice(0, -1).map(unb64)
      expect(out).toEqual(UNDEFINED_DATA_CASES.map((c) => c.message))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  it.skipIf(kotlinxToolchain() === undefined || jvmPath() === undefined)('Kotlin: every corpus key hashes as TanStack hashes it', () => {
    const tc = kotlinxToolchain() as { classpath: string; plugin: string }
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-query-hash-kotlin-'))
    try {
      const blocks = UNDEFINED_DATA_CASES.map(
        (c) => `    run {\n        val id: String = ${JSON.stringify(c.props.id).replace(/\$/g, '\\$')}\n        val n: Double = ${Number.isInteger(c.props.n) ? `${c.props.n}.0` : c.props.n}\n        println(java.util.Base64.getEncoder().encodeToString((${emittedHash(c, 'kotlin')} + " data is undefined").toByteArray(Charsets.UTF_8)))\n    }`,
      )
      writeFileSync(join(dir, 'Main.kt'), `import com.pyreon.runtime.*\n\nfun main() {\n${blocks.join('\n')}\n}\n`)
      execFileSync(
        'kotlinc',
        ['-nowarn', `-Xplugin=${tc.plugin}`, '-cp', tc.classpath, join(KOTLIN_RUNTIME, 'PyreonJson.kt'), join(dir, 'Main.kt'), '-d', join(dir, 'out')],
        { stdio: 'pipe' },
      )
      const out = execFileSync(jvmPath() as string, ['-cp', `${join(dir, 'out')}:${tc.classpath}:${kotlinStdlib()}`, 'MainKt'])
        .toString('utf8')
        .split('\n')
        .slice(0, -1)
        .map(unb64)
      expect(out).toEqual(UNDEFINED_DATA_CASES.map((c) => c.message))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)
})

/** kotlinc's own stdlib jar, for running a class directory. */
function kotlinStdlib(): string {
  const home = join(dirname(realpathSync(execFileSync('which', ['kotlinc'], { encoding: 'utf8' }).trim())), '..')
  const lib = [join(home, 'lib'), join(home, 'libexec', 'lib')].find((d) => existsSync(join(d, 'kotlin-stdlib.jar'))) as string
  return join(lib, 'kotlin-stdlib.jar')
}

describe("@pyreon/feature's useList / useById: a 204 fails the query with the web's hash", () => {
  const FEATURE = (target: 'swift' | 'kotlin') =>
    transform(
      `
import { Text } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'
export const Todo = defineFeature({ name: 'todo', schema: { id: 'string', title: 'string' }, api: 'https://api.example.com/todos' })
export function T(props: { id: string }) {
  const list = Todo.useList()
  const one = Todo.useById(() => props.id)
  return <Text>{list.error()?.message ?? one.error()?.message ?? ''}</Text>
}
`,
      { target },
    ).code

  it('useList names `["todo","list",{}]`; useById names `["todo",<id as JSON>]` — only for a 204', () => {
    const sw = FEATURE('swift')
    const kt = FEATURE('kotlin')
    expect(sw).toContain('if __response.status == 204 {\n            throw PyreonQueryDataUndefined(queryHash: "[\\"todo\\",\\"list\\",{}]")')
    expect(sw).toContain('throw PyreonQueryDataUndefined(queryHash: "[\\"todo\\",\\(PyreonJSON.stringify(id))]")')
    expect(kt).toContain('if (__response.status == 204) throw PyreonQueryDataUndefined("[\\"todo\\",\\"list\\",{}]")')
    expect(kt).toContain('if (__response.status == 204) throw PyreonQueryDataUndefined("[\\"todo\\",${PyreonJson.stringify(id)}]")')
  })
})
