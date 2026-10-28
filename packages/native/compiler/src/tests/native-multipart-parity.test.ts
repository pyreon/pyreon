import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// The ORACLES: the web's own multipart encoder and URI reader, serialized by the platform's own FormData.
import { fileFromUri } from '../../../../fundamentals/hooks/src/fileFromUri'
import { encodeMultipart } from '../../../../fundamentals/http/src/body'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * A `multipart` body (#3979) is built by the RUNTIME: `PyreonMultipartBody` on each target writes the
 * `multipart/form-data` bytes, streaming file parts from disk. Its web half is `@pyreon/http`'s `encodeMultipart` →
 * `FormData`, serialized by the platform (undici here, the browser in an app). One source file sends both, so a
 * server must receive the same bytes from either.
 *
 * Asserted by EXECUTION: the shipped runtime source is compiled by the real toolchain, run over the corpus, and its
 * output compared byte for byte with what `new Response(encodeMultipart(fields))` produces — with the one honest
 * difference, the random boundary, replaced by a fixed one on both sides. File parts come from `data:` URIs read
 * through each side's own reader (`fileFromUri` on the web, `PyreonUploadFile.from` natively), so the URI parsing is
 * under test too, not only the writer.
 *
 * The corpus covers each branch of the encoder and of the WHATWG serialization: newline normalization of names and
 * text values (CR, LF, CRLF), the `"` / CR / LF escape of names and filenames, `String(number)` digits, booleans,
 * dropped nullish values, a one-level array expansion, a file with and without a type, a non-ASCII filename, binary
 * bytes that are not valid UTF-8, and the data-URL corners of the Fetch standard (the default `text/plain` type,
 * byte-level percent decoding, a case-insensitive `;base64`).
 */

const SWIFT_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonHttp.swift')
const SWIFT_JSON_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonJSON.swift')
const KOTLIN_SRC = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonHttp.kt')

const BOUNDARY = 'PyreonParityBoundary'

/**
 * The upload writer, VERBATIM from the shipped source: `PyreonHttpError` plus everything from the uploads section to
 * the end of the file (the uploads, then `PyreonURL`, whose `unwrap` / `jsString` the writer calls). Not the whole
 * file: its transport half needs `URLSession`, which on Linux lives in FoundationNetworking — the writer does not,
 * so a slice keeps the gate running on the Linux CI lane, where the whole-file compile fails before any byte is
 * compared.
 */
function swiftUploadSource(): string {
  const src = readFileSync(SWIFT_SRC, 'utf8')
  const errorAt = src.indexOf('public enum PyreonHttpError')
  const errorEnd = src.indexOf('\n}\n', errorAt)
  const uploadsAt = src.indexOf('// MARK: - Uploads')
  if (errorAt < 0 || errorEnd < 0 || uploadsAt < 0) throw new Error('PyreonHttp.swift no longer has the sections this gate slices')
  return `import Foundation\n\n${src.slice(errorAt, errorEnd + 3)}\n${src.slice(uploadsAt)}`
}

interface FilePart {
  readonly uri: string
  readonly name?: string
  readonly type?: string
}
type Scalar = string | number | boolean | null
type Value = Scalar | readonly Scalar[] | { readonly file: FilePart }
type Case = readonly (readonly [string, Value])[]

const BINARY = Buffer.from([0x00, 0xff, 0xfe, 0x0d, 0x0a, 0x80, 0x7f, 0x2d, 0x2d])
const dataUri = (bytes: Buffer, type: string): string => `data:${type};base64,${bytes.toString('base64')}`

const CASES: readonly Case[] = [
  [['caption', 'hello world']],
  [['lf', 'a\nb'], ['cr', 'a\rb'], ['crlf', 'a\r\nb'], ['mixed', '\n\r\r\n']],
  [['we"ird\nna\rme', 'v']],
  [['page', 2], ['n', 1.5], ['big', 1e21], ['tiny', 1e-7], ['frac', 0.1 + 0.2]],
  [['on', true], ['off', false]],
  [['gone', null], ['kept', 'x']],
  [['tag', ['a', 'b c', null, 'd']]],
  [['žluťoučký', 'kůň 日本 🙂']],
  [['avatar', { file: { uri: dataUri(Buffer.from('PNGDATA'), 'image/png'), name: 'avatar.png' } }], ['caption', 'me']],
  [['doc', { file: { uri: dataUri(BINARY, 'application/x-raw'), name: 'q"u\no\rte.bin' } }]],
  [['blob', { file: { uri: dataUri(Buffer.from('plain'), 'text/plain') } }]],
  [['typed', { file: { uri: dataUri(Buffer.from('x'), 'text/plain'), name: 'renamed.csv', type: 'text/csv' } }]],
  [['untyped', { file: { uri: `data:,${encodeURIComponent('no type')}`, name: 'n.txt' } }]],
  [['ünï', { file: { uri: dataUri(Buffer.from('u'), 'text/plain'), name: 'fïlé 名前.txt' } }]],
  // A percent-encoded payload is BYTES (0xFF is not UTF-8), and a malformed escape stays literal.
  [['raw', { file: { uri: 'data:application/octet-stream,%FF%00a%zz%4', name: 'r.bin' } }]],
  // A parameter list with no type is a parameter of text/plain; `;base64` is matched case-insensitively.
  [['params', { file: { uri: 'data:;charset=UTF-8,x', name: 'p.txt' } }]],
  [['b64', { file: { uri: 'data:Text/Plain;BASE64,aGk=', name: 'b.txt' } }]],
]

const isFile = (v: Value): v is { readonly file: FilePart } =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && 'file' in v

/** What the web sends for a case, with its boundary fixed. */
async function expected(c: Case): Promise<string> {
  const fields: Record<string, unknown> = {}
  for (const [k, v] of c) {
    fields[k] = isFile(v) ? await fileFromUri(v.file.uri, { name: v.file.name, type: v.file.type }) : v
  }
  const res = new Response(encodeMultipart(fields as never))
  const boundary = /boundary=(.+)$/.exec(res.headers.get('content-type') ?? '')?.[1]
  expect(boundary, 'undici names its boundary').toBeDefined()
  const latin1 = Buffer.from(await res.arrayBuffer()).toString('latin1')
  return Buffer.from(latin1.split(boundary as string).join(BOUNDARY), 'latin1').toString('base64')
}

/** A string literal in Swift source, every non-ASCII scalar escaped. */
const swiftLit = (s: string): string =>
  `"${[...s]
    .map((ch) => {
      const cp = ch.codePointAt(0) as number
      if (ch === '"' || ch === '\\') return `\\${ch}`
      return cp < 0x20 || cp > 0x7e ? `\\u{${cp.toString(16)}}` : ch
    })
    .join('')}"`

/** A string literal in Kotlin source: UTF-16 units escaped, `$` too. */
const kotlinLit = (s: string): string =>
  `"${Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))
    .map((u) => {
      const ch = String.fromCharCode(u)
      if (ch === '"' || ch === '\\' || ch === '$') return `\\${ch}`
      return u < 0x20 || u > 0x7e ? `\\u${u.toString(16).padStart(4, '0')}` : ch
    })
    .join('')}"`

// An integral value with no fraction in the source is an Int (Swift) / Long (Kotlin), as the compiler types `page()`.
const integral = (n: number): boolean => Number.isInteger(n) && Math.abs(n) < 2 ** 53 && !String(n).includes('e')

function scalarFor(v: Scalar, lang: 'swift' | 'kotlin'): string {
  const lit = lang === 'swift' ? swiftLit : kotlinLit
  if (v === null) return lang === 'swift' ? '(nil as String?)' : 'null'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') {
    if (integral(v)) return lang === 'swift' ? `${v}` : `${v}L`
    return lang === 'swift' ? `(${v} as Double)` : `(${v})`
  }
  return lit(v)
}

function valueFor(v: Value, lang: 'swift' | 'kotlin'): string {
  const lit = lang === 'swift' ? swiftLit : kotlinLit
  if (isFile(v)) {
    const { uri, name, type } = v.file
    if (lang === 'swift') {
      const extra = [name === undefined ? '' : `, name: ${lit(name)}`, type === undefined ? '' : `, type: ${lit(type)}`]
      return `(try await PyreonUploadFile.from(${lit(uri)}${extra.join('')}))`
    }
    const extra = [name === undefined ? '' : `, name = ${lit(name)}`, type === undefined ? '' : `, type = ${lit(type)}`]
    return `PyreonUploadFiles.from(${lit(uri)}${extra.join('')})`
  }
  if (Array.isArray(v)) {
    const items = (v as readonly Scalar[]).map((x) => scalarFor(x, lang))
    return lang === 'swift' ? `([${items.join(', ')}] as [Any?])` : `listOf<Any?>(${items.join(', ')})`
  }
  return scalarFor(v as Scalar, lang)
}

const bodyFor = (c: Case, lang: 'swift' | 'kotlin'): string => {
  const lit = lang === 'swift' ? swiftLit : kotlinLit
  return `PyreonMultipartBody(${c.flatMap(([k, v]) => [lit(k), valueFor(v, lang)]).join(', ')})`
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function jvmPath(): string | undefined {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    // fall through to the off-PATH locations
  }
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java', '/usr/bin/java']) {
    if (existsSync(c)) return c
  }
  return undefined
}

describe('PyreonMultipartBody -- parity with the web encodeMultipart + FormData', () => {
  it('the corpus is discriminating: normalization, escaping, a file and binary bytes all occur', async () => {
    const all = await Promise.all(CASES.map(expected))
    const text = all.map((b) => Buffer.from(b, 'base64').toString('latin1')).join('')
    expect(text).toContain('name="we%22ird%0D%0Ana%0D%0Ame"')
    expect(text).toContain('a\r\nb')
    expect(text).toContain('filename="q%22u%0Ao%0Dte.bin"')
    expect(text).toContain('Content-Type: application/octet-stream')
    expect(text).toContain('filename="blob"')
    expect(text).toContain(BINARY.toString('latin1'))
  })

  it.skipIf(!isSwiftcAvailable())(
    'the SHIPPED Swift writer produces the same bytes, executed',
    async () => {
      const want = await Promise.all(CASES.map(expected))
      const got = withTempDir('pyreon-multipart-parity-swift-', (dir) => {
        const lines = CASES.map(
          (c, i) => `do {
    let url = URL(fileURLWithPath: ${swiftLit(join(dir, `out${i}.bin`))})
    try ${bodyFor(c, 'swift')}.write(to: url, boundary: ${swiftLit(BOUNDARY)})
    print(try Data(contentsOf: url).base64EncodedString())
} catch { print("ERROR \\(error)") }`,
        )
        writeFileSync(join(dir, 'main.swift'), `import Foundation\n\n${lines.join('\n')}\n`)
        writeFileSync(join(dir, 'PyreonUpload.swift'), swiftUploadSource())
        execFileSync('swiftc', [join(dir, 'PyreonUpload.swift'), SWIFT_JSON_SRC, join(dir, 'main.swift'), '-o', join(dir, 'run')], {
          stdio: 'pipe',
        })
        return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n')
      })
      expect(got.slice(0, CASES.length)).toEqual(want)
    },
    240_000,
  )

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin writer produces the same bytes, and states its length, executed',
    async () => {
      const want = await Promise.all(CASES.map(expected))
      const java = jvmPath() as string
      const got = withTempDir('pyreon-multipart-parity-kotlin-', (dir) => {
        const lines = CASES.map(
          (c) => `    run {
        val body = ${bodyFor(c, 'kotlin')}
        val out = java.io.ByteArrayOutputStream()
        body.writeTo(out, ${kotlinLit(BOUNDARY)})
        val bytes = out.toByteArray()
        // A stated length that disagrees with the bytes written truncates or stalls the request on OkHttp.
        val stated = body.contentLength(${kotlinLit(BOUNDARY)})
        if (stated != null && stated != bytes.size.toLong()) println("LENGTH $stated != \${bytes.size}")
        else println(java.util.Base64.getEncoder().encodeToString(bytes))
    }`,
        )
        writeFileSync(join(dir, 'Main.kt'), `import com.pyreon.runtime.*\n\nfun main() {\n${lines.join('\n')}\n}\n`)
        execFileSync('kotlinc', [KOTLIN_SRC, join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'run.jar')], {
          stdio: 'pipe',
        })
        return execFileSync(java, ['-jar', join(dir, 'run.jar')], { encoding: 'utf8' }).split('\n')
      })
      expect(got.slice(0, CASES.length)).toEqual(want)
    },
    300_000,
  )
})
