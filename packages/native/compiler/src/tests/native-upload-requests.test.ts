// Uploads (#3979): a `multipart` form carrying a picked file, a raw file `body`, a `form` body, and `fileFromUri`
// — the step that turns a picker's URI into something a request can send.
//
// Every spec asserts the EMIT on both targets and compiles it against the stub gates (both toolchains). The byte-level
// contract is `native-multipart-parity` (the runtime writer vs the web's FormData, executed); what reaches the wire
// is the runtime's loopback test (`PyreonHttpWireTests`).
import { describe, expect, it } from 'vitest'
import { encodeForm } from '../../../../fundamentals/http/src/body'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const HEAD = `
import { signal } from '@pyreon/reactivity'
import { createHttp } from '@pyreon/http'
import { useMutation } from '@pyreon/query'
import { fileFromUri, useImagePicker, useFetch } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
interface Meta { tag: string; n: number }
interface Reply { id: string }
const api = createHttp({ baseUrl: 'https://x.test/api' })
const upload = api.endpoint('POST /avatar')
const put = api.endpoint('PUT /blob')
const login = api.endpoint('POST /login')
`

const both = (src: string) => ({
  swift: transform(HEAD + src, { target: 'swift' }),
  kotlin: transform(HEAD + src, { target: 'kotlin' }),
})

const compiles = (src: string): void => {
  const { swift, kotlin } = both(src)
  if (isSwiftcAvailable()) {
    const v = validateSwiftWithStubs(swift.code)
    expect(v.ok, `swift:\n${JSON.stringify(v)}\n${swift.code}`).toBe(true)
  }
  if (isKotlincAvailable()) {
    const v = validateKotlin(kotlin.code)
    expect(v.ok, `kotlin:\n${JSON.stringify(v)}\n${kotlin.code}`).toBe(true)
  }
}

/** The issue's own shape: pick, bail on cancel, upload the file with text fields. */
const PICK_AND_UPLOAD = `
export function AvatarButton() {
  const picker = useImagePicker()
  const caption = signal('hi')
  const meta = signal<Meta>({ tag: 'a', n: 1 })
  const status = signal('idle')
  const change = async () => {
    const uri = await picker.pick()
    if (uri === null) return
    await upload({ multipart: { avatar: await fileFromUri(uri, { name: 'avatar.jpg' }), caption: caption(), meta: meta(), fixed: 'x', n: [1, 2] } })
    status.set('done')
  }
  return <Stack><Button onPress={change}>Change photo</Button><Text>{status()}</Text></Stack>
}`

describe('a multipart upload from a picked file', () => {
  it('builds a PyreonMultipartBody in source order, the file resolved where the call is made', () => {
    const { swift, kotlin } = both(PICK_AND_UPLOAD)
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).toContain(
      'upload: .multipart(PyreonMultipartBody("avatar", try await PyreonUploadFile.from(uri, name: "avatar.jpg"), "caption", caption, "meta", PyreonJSON.stringify(meta), "fixed", "x", "n", "1", "n", "2"))',
    )
    expect(kotlin.code).toContain(
      'upload = PyreonHttpUpload.Multipart(PyreonMultipartBody("avatar", PyreonUploadFiles.from(pyreonContext, uri, name = "avatar.jpg"), "caption", caption, "meta", PyreonJson.stringify(meta), "fixed", "x", "n", "1", "n", "2"))',
    )
    // A content:// URI needs the app's ContentResolver: the composable's context is hoisted once.
    expect(kotlin.code).toContain('val pyreonContext = LocalContext.current')
  })

  it("narrows the picker's optional result past the cancel guard (a picker method is typed)", () => {
    const { swift, kotlin } = both(PICK_AND_UPLOAD)
    expect(swift.code).toMatch(/guard let uri else \{\s+return\s+\}/)
    // Kotlin smart-casts a val after the null check; the early return leaves the coroutine.
    expect(kotlin.code).toMatch(/if \(uri == null\) \{\s+return@launch\s+\}/)
  })

  it('compiles', () => compiles(PICK_AND_UPLOAD), 120_000)
})

describe('a raw body', () => {
  const SRC = `
export function C() {
  const text = signal('hello')
  const send = async (uri: string) => {
    const f = await fileFromUri(uri, { type: 'image/png' })
    await put({ body: f })
    await put({ body: text() })
  }
  return <Button onPress={() => send('file:///x.png')}>Go</Button>
}`

  it('a file streams as the body; a string is a text body with the Fetch default type', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).toContain('upload: .file(f)')
    expect(kotlin.code).toContain('upload = PyreonHttpUpload.File(f)')
    expect(swift.code).toContain('"content-type": "text/plain;charset=UTF-8"')
    expect(swift.code).toContain('body: Data((text).utf8)')
  })

  it('compiles', () => compiles(SRC), 120_000)
})

describe('a form body', () => {
  it('all-literal is encoded at compile time by the web encodeForm itself', () => {
    const { swift, kotlin } = both(`
export function C() {
  const go = async () => { await login({ form: { user: 'a b&c', keep: true, n: 1.5, gone: null, tags: ['x', 'y'] } }) }
  return <Button onPress={go}>Go</Button>
}`)
    const wire = encodeForm({ user: 'a b&c', keep: true, n: 1.5, gone: null, tags: ['x', 'y'] } as never).toString()
    expect(swift.code).toContain(`body: Data("${wire}".utf8)`)
    expect(kotlin.code).toContain(`body = "${wire}"`)
    expect(swift.code).toContain('"content-type": "application/x-www-form-urlencoded"')
  })

  it('a runtime value is serialized at request time by the URLSearchParams twin', () => {
    const SRC = `
export function C() {
  const user = signal('a')
  const go = async () => { await login({ form: { user: user(), keep: true } }) }
  return <Button onPress={go}>Go</Button>
}`
    const { swift, kotlin } = both(SRC)
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('PyreonURL.query("", "user", user, "keep", true)')
    expect(kotlin.code).toContain('PyreonURL.query("", "user", user, "keep", true)')
    compiles(SRC)
  }, 120_000)

  it('a nested object is named — its encoding depends on the OpenAPI style', () => {
    const { swift } = both(`
export function C() {
  const go = async () => { await login({ form: { card: { n: 1 } } }) }
  return <Button onPress={go}>Go</Button>
}`)
    expect(swift.warnings.join('\n')).toMatch(/form field `card` is a nested object/)
  })
})

describe('in a mutation', () => {
  const SRC = `
export function C() {
  const save = useMutation<Reply>({ mutationFn: (file: string) => upload({ multipart: { avatar: file, note: 'n' } }) })
  const picker = useImagePicker()
  const go = async () => {
    const uri = await picker.pick()
    if (uri === null) return
    save.mutate(uri)
  }
  return <Stack><Button onPress={go}>Go</Button><Text>{save.data()?.id ?? ''}</Text></Stack>
}`

  it('the multipart body is built where mutate is called', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('save.mutate(PyreonHttpRequest(method: .post, url: "https://x.test/api/avatar", upload: .multipart(PyreonMultipartBody("avatar", uri, "note", "n")))')
    expect(kotlin.code).toContain('upload = PyreonHttpUpload.Multipart(PyreonMultipartBody("avatar", uri, "note", "n"))')
  })

  it('compiles', () => compiles(SRC), 120_000)
})

describe('in useFetch', () => {
  const SRC = `
export function C() {
  const note = signal('n')
  const r = useFetch<Reply>(upload({ multipart: { b: 'x', note: note() } }))
  return <Text>{r.data()?.id ?? ''}</Text>
}`

  it('the multipart body rides the mount-time request', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('upload: .multipart(PyreonMultipartBody("b", "x", "note", note))')
    expect(kotlin.code).toContain('upload = PyreonHttpUpload.Multipart(PyreonMultipartBody("b", "x", "note", note))')
  })

  it('compiles', () => compiles(SRC), 120_000)
})

describe('named, never silently wrong', () => {
  const warningsOf = (src: string): string => {
    const { swift, kotlin } = both(src)
    expect(swift.warnings).toEqual(kotlin.warnings)
    return swift.warnings.join('\n')
  }

  it('fileFromUri without await is a Promise on the web, sent as text', () => {
    expect(
      warningsOf(`
export function C() {
  const go = async (uri: string) => { await upload({ multipart: { f: fileFromUri(uri) } }) }
  return <Button onPress={() => go('x')}>Go</Button>
}`),
    ).toMatch(/`fileFromUri\(…\)` without `await`/)
  })

  it('two body encodings at once — the web throws', () => {
    expect(
      warningsOf(`
export function C() {
  const go = async () => { await upload({ json: { a: 1 }, multipart: { b: 'x' } }) }
  return <Button onPress={go}>Go</Button>
}`),
    ).toMatch(/passes `json` and `multipart`/)
  })


  it('a runtime array of objects in multipart', () => {
    expect(
      warningsOf(`
export function C() {
  const rows = signal<Meta[]>([])
  const go = async () => { await upload({ multipart: { rows: rows() } }) }
  return <Button onPress={go}>Go</Button>
}`),
    ).toMatch(/multipart field "rows" is an array of objects/)
  })
})

describe('early returns in handlers (found by the upload shape)', () => {
  const SRC = `
export function C() {
  const n = signal(0)
  const photo = signal<string | null>(null)
  const send = async () => {
    if (photo() === null) return
    await upload({ multipart: { file: await fileFromUri(photo()) } })
  }
  return <Stack><Button onPress={() => { if (n() > 3) return; n.set(n() + 1) }}>x</Button><Button onPress={send}>s</Button><Text>{n()}</Text></Stack>
}`

  it('Kotlin labels the return: return@launch in a coroutine, return@pyreonHandler in a plain handler', () => {
    const { kotlin } = both(SRC)
    expect(kotlin.code).toContain('return@launch')
    expect(kotlin.code).toMatch(/onClick = pyreonHandler@\{\s+if \(n > 3L\) \{\s+return@pyreonHandler/)
  })

  it('a handler with no return is unchanged — no label', () => {
    const { kotlin } = both(`
export function C() {
  const n = signal(0)
  return <Button onPress={() => { n.set(n() + 1); n.set(n() + 2) }}>x</Button>
}`)
    expect(kotlin.code).not.toContain('pyreonHandler@')
  })

  it('compiles', () => compiles(SRC), 120_000)
})
