import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { kotlinNamesOf, swiftTypeOf, verifyServiceTypes } from '../plugin-verify'
import { serviceSpecsOf } from '../service-registry'
import { SERVICES } from '../services'

const NATIVE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../fundamentals/hooks/native')

function read(dir: string, extension: string): string[] {
  const texts: string[] = []
  const walk = (path: string): void => {
    if (statSync(path).isDirectory()) readdirSync(path).forEach((e) => walk(join(path, e)))
    else if (path.endsWith(extension)) texts.push(readFileSync(path, 'utf8'))
  }
  walk(dir)
  return texts
}

const REAL = {
  swiftSources: read(join(NATIVE, 'swift'), '.swift'),
  kotlinSources: read(join(NATIVE, 'kotlin'), '.kt'),
}

describe('verifyServiceTypes against the REAL runtime sources', () => {
  it('has real sources to read (a skipped suite must not masquerade as coverage)', () => {
    expect(REAL.swiftSources.length).toBeGreaterThan(10)
    expect(REAL.kotlinSources.length).toBeGreaterThan(10)
  })

  it('finds every built-in service type declared', () => {
    expect(SERVICES).toHaveLength(8)
    expect(verifyServiceTypes({ services: serviceSpecsOf(SERVICES) }, REAL)).toEqual([])
  })

  it('reports a phantom Swift type and a phantom Kotlin type', () => {
    const [share] = SERVICES
    const findings = verifyServiceTypes(
      {
        services: {
          useShare: {
            swift: 'PyreonShareTYPO()',
            kotlin: ['val {id} = remember { PyreonShareTYPO({id}Ctx) }'],
          },
          useOk: share!,
        },
      },
      REAL,
    )
    expect(findings.map((f) => [f.hook, f.target, f.name])).toEqual([
      ['useShare', 'swift', 'PyreonShareTYPO'],
      ['useShare', 'kotlin', 'PyreonShareTYPO'],
    ])
    expect(findings[0]!.message).toContain('not declared in the shipped Swift sources')
  })

  it('reports a declaration it cannot read anything from', () => {
    const findings = verifyServiceTypes(
      { services: { useWeird: { swift: 'someValue', kotlin: ['val {id} = 1'] } } },
      { swiftSources: [], kotlinSources: [] },
    )
    expect(findings.map((f) => [f.target, f.name])).toEqual([
      ['swift', ''],
      ['kotlin', ''],
    ])
  })
})

describe('declaration matching', () => {
  const swift = (text: string) => ({
    swiftSources: [text],
    kotlinSources: ['class K\nfun rememberPyreonK() {}'],
  })
  const svc = (s: string) => ({ useX: { swift: s, kotlin: ['val {id} = remember { K() }'] } })

  it.each(['final class Foo {', 'struct Foo {', 'actor Foo {', 'public enum Foo {'])(
    'accepts Swift `%s`',
    (decl) => {
      expect(verifyServiceTypes({ services: svc('Foo()') }, swift(decl))).toEqual([])
    },
  )

  it('ignores a declaration that only appears in a comment or as a longer name', () => {
    for (const text of ['// class Foo {}', '/* struct Foo {} */', 'class FooBar {}']) {
      expect(verifyServiceTypes({ services: svc('Foo()') }, swift(text)).map((f) => f.name)).toEqual(['Foo'])
    }
  })

  it('is not fooled by `/*` inside a line comment or a string literal', () => {
    const text = '// see Documents/*\nval url = "https://x.dev/*"\nfinal class Foo {}'
    expect(verifyServiceTypes({ services: svc('Foo()') }, swift(text))).toEqual([])
  })

  it('accepts Kotlin class, object and fun declarations', () => {
    for (const text of ['class Foo(val a: Int)', 'object Foo {', 'fun Foo(a: Int) = 1', 'fun <T> Foo(a: T) = 1']) {
      const result = verifyServiceTypes(
        { services: { useX: { swift: 'S()', kotlin: ['val {id} = remember { Foo() }'] } } },
        { swiftSources: ['class S {}'], kotlinSources: [text] },
      )
      expect(result, text).toEqual([])
    }
  })

  it('extracts the leading names', () => {
    expect(swiftTypeOf('PyreonCamera(presenter: UIKitCameraPresenter())')).toBe('PyreonCamera')
    expect(swiftTypeOf('42')).toBeUndefined()
    expect(
      kotlinNamesOf([
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonShare({id}Ctx) }',
        'val {id}2 = rememberPyreonThing(x)',
      ]),
    ).toEqual(['PyreonShare', 'rememberPyreonThing'])
  })
})
