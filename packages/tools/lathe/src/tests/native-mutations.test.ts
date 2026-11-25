/**
 * A write (`POST` / `PUT` / `PATCH` / `DELETE`) reaches native as a MUTATION
 * component (#4835).
 *
 * The reach report used to call every write `web-only` because "PMTC does not
 * yet recognise" mutations, long after `@pyreon/query`'s native plugin started
 * lowering `useMutation(ep.mutation())` to the `PyreonMutation` runtime. The
 * generated component holds the mutation, calls `mutate` itself (the request is
 * built at that call site) and hands the trigger to `children`, with path
 * params and the JSON body as props.
 *
 * Proven like every native claim in this package: the real compiler over the
 * generated module (POSITIVE marker, zero warnings), the stub compile gates,
 * the module typechecking as ordinary TypeScript, and a Swift compile against
 * the SHIPPED mutation runtime.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  transform,
  validateKotlin,
  validateSwiftWithStubs,
} from './native-plugins'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { verifyNative, worstVerdict } from '../verify/lower'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const json = (schema: unknown) => ({ description: 'x', content: { 'application/json': { schema } } })
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Notes', version: '1.0.0' },
  servers: [{ url: 'https://notes.test/v1' }],
  paths: {
    '/notes': {
      get: { operationId: 'listNotes', tags: ['notes'], responses: { 200: json({ type: 'array', items: { $ref: '#/components/schemas/Note' } }) } },
      post: {
        operationId: 'createNote',
        tags: ['notes'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NoteInput' } } } },
        responses: { 201: json({ $ref: '#/components/schemas/Note' }) },
      },
    },
    '/notes/{id}': {
      put: {
        operationId: 'renameNote',
        tags: ['notes'],
        parameters: [id],
        // An OPTIONAL inline body and an inline response: both are named once.
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } } } },
        responses: { 200: json({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }) },
      },
      delete: { operationId: 'deleteNote', tags: ['notes'], parameters: [id], responses: { 204: { description: 'gone' } } },
      head: { operationId: 'noteExists', tags: ['ops'], parameters: [id], responses: { 200: { description: 'ok' } } },
    },
    '/logout': { post: { operationId: 'logout', tags: ['ops'], responses: { 204: { description: 'bye' } } } },
    '/upload': {
      post: {
        operationId: 'upload',
        tags: ['ops'],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 204: { description: 'ok' } },
      },
    },
    '/export': { post: { operationId: 'exportCsv', tags: ['ops'], responses: { 200: { description: 'x', content: { 'text/csv': { schema: { type: 'string' } } } } } } },
    '/search': {
      post: {
        operationId: 'search',
        tags: ['ops'],
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'ok' } },
      },
    },
    '/docs/{json}': {
      delete: { operationId: 'dropDoc', tags: ['ops'], parameters: [{ name: 'json', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'x' } } },
    },
  },
  components: {
    schemas: {
      Note: { type: 'object', required: ['id', 'title'], properties: { id: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } } },
      NoteInput: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, body: { type: 'string' } } },
    },
  },
})

const out = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform' }))

const mod = (path: string): string => {
  const f = out.files.find((x) => x.path === path)
  if (!f) throw new Error(`no ${path}; have ${out.files.map((x) => x.path).join(', ')}`)
  return f.contents
}

const MODULES = ['notes.native.tsx', 'ops.native.tsx'] as const

describe('a write is a native MUTATION component', () => {
  it('reaches native, and a write it cannot lower says why in spec terms', () => {
    for (const op of ['listNotes', 'createNote', 'renameNote', 'deleteNote', 'logout']) {
      expect(out.reach.get(op), op).toEqual({ reach: 'web+native' })
    }
    const reason = (op: string): string | undefined => {
      expect(out.reach.get(op)?.reach, op).toBe('web-only')
      return out.reach.get(op)?.reason
    }
    expect(reason('upload')).toContain('sends a JSON body only')
    expect(reason('exportCsv')).toContain('`text/csv`')
    expect(reason('search')).toContain('required query parameter `q`')
    expect(reason('dropDoc')).toContain('path parameter `json`')
    expect(reason('noteExists')).toContain('has no native component')
    // The stale claim is gone from every reason.
    for (const [, r] of out.reach) expect(r.reason ?? '').not.toContain('does not yet recognise')
  })

  it('holds the mutation, calls `mutate` itself and hands the trigger to `children`', () => {
    const notes = mod('notes.native.tsx')
    expect(notes).toContain("import { useMutation, useQuery } from '@pyreon/query'")
    expect(notes).toContain(
      'export function CreateNoteMutation(props: { json: NoteInput; children: (mutate: () => void, data: Note | undefined, isPending: boolean, error: Error | null) => unknown })',
    )
    expect(notes).toContain('const __m = useMutation<Note, Error, { json: NoteInput }>(createNote.mutation())')
    expect(notes).toContain('return () => props.children(() => __m.mutate({ json: props.json }), __m.data(), __m.isPending(), __m.error())')
    // Inline body and response are named once; the optional body is still a required prop.
    expect(notes).toContain('export type RenameNoteBody = {')
    expect(notes).toContain('export type RenameNoteResult = {')
    expect(notes).toContain('export function RenameNoteMutation(props: { id: string; json: RenameNoteBody; children:')
    expect(notes).toContain('__m.mutate({ params: { id: props.id }, json: props.json })')
    // No content: nothing decoded, no `data` slot.
    expect(notes).toContain(
      'export function DeleteNoteMutation(props: { id: string; children: (mutate: () => void, isPending: boolean, error: Error | null) => unknown })',
    )
    expect(notes).toContain('useMutation<unknown, Error, { params: { id: string } }>(deleteNote.mutation())')
    const ops = mod('ops.native.tsx')
    expect(ops).toContain('useMutation<unknown, Error, {}>(logout.mutation())')
    expect(ops).toContain('props.children(() => __m.mutate({}), __m.isPending(), __m.error())')
    for (const blocked of ['UploadMutation', 'ExportCsvMutation', 'SearchMutation', 'DropDocMutation', 'NoteExistsMutation']) {
      expect(ops).not.toContain(blocked)
    }
  })

  for (const path of MODULES) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${path} lowers on ${target}: zero warnings, the mutation runtime in the emit`, () => {
        const r = transform(mod(path), { target })
        expect(r.warnings).toEqual([])
        expect(r.code).toContain('PyreonMutation<')
        expect(r.code).not.toMatch(/\buseMutation\b|\.mutation\(\)/)
        if (path === 'notes.native.tsx') {
          expect(r.code).toContain(target === 'swift' ? 'PyreonJSON.stringify(json)' : 'PyreonJson.stringify(json)')
          expect(r.code).toContain(target === 'swift' ? 'PyreonMutation<Void>' : 'PyreonMutation<Unit>')
        }
      })
    }
  }

  describe.skipIf(!isSwiftcAvailable())('swiftc (stubs)', () => {
    for (const path of MODULES) {
      it(`accepts ${path}`, () => {
        expect(validateSwiftWithStubs(transform(mod(path), { target: 'swift' }).code).error ?? '').toBe('')
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc (stubs)', () => {
    for (const path of MODULES) {
      it(`accepts ${path}`, () => {
        expect(validateKotlin(transform(mod(path), { target: 'kotlin' }).code).error ?? '').toBe('')
      })
    }
  })

  const QUERY_RUNTIME = join(__dirname, '../../../../fundamentals/query/native')
  const CORE_SWIFT = join(__dirname, '../../../../native/runtime-swift/Sources/PyreonRuntime')

  it.skipIf(!isSwiftUIAvailable())('Swift: compiles against the real SDK and the SHIPPED mutation runtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lathe-mutation-swift-'))
    try {
      const files = MODULES.map((path, i) => {
        const p = join(dir, `M${i}.swift`)
        writeFileSync(p, `import SwiftUI\nimport Foundation\n${transform(mod(path), { target: 'swift' }).code}`)
        return p
      })
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      execFileSync(
        'xcrun',
        [
          '--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk,
          // The runtime sources compiled alongside ARE the `PyreonRuntime` module here.
          '-module-name', 'PyreonRuntime',
          ...files,
          join(QUERY_RUNTIME, 'swift/PyreonMutation.swift'),
          join(QUERY_RUNTIME, 'swift/PyreonQuery.swift'),
          join(CORE_SWIFT, 'PyreonHttp.swift'),
          join(CORE_SWIFT, 'PyreonJSON.swift'),
          join(CORE_SWIFT, 'PyreonSchema.swift'),
        ],
        { stdio: 'pipe', encoding: 'utf8' },
      )
    } catch (err) {
      const e = err as { stderr?: string }
      expect.fail(`swiftc: ${(e.stderr ?? String(err)).split('\n').filter((l) => l.includes('error:')).slice(0, 8).join('\n')}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  it('the verifier reports the modules as lowering', () => {
    const report = verifyNative(
      out.files.filter((f) => (MODULES as readonly string[]).includes(f.path)),
      transform,
    )
    expect(report.files.every((f) => f.verdict === 'lowers')).toBe(true)
    expect(report.files.some((f) => f.markers.includes('PyreonMutation<'))).toBe(true)
    expect(worstVerdict(report)).toBe('lowers')
  })

  it('the native modules typecheck as ordinary TypeScript (they run on the web too)', () => {
    const native = Object.fromEntries(
      out.files.filter((f) => f.path.endsWith('.native.tsx')).map((f) => [f.path, f.contents]),
    )
    const { errors } = typecheckSpec('native-mutations', SPEC, { target: 'multiplatform' }, { extra: native })
    cleanTypecheck('native-mutations')
    expect(errors).toEqual([])
  })
})
