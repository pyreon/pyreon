// auditNative — project scan for multiplatform (PMTC) build hazards in
// `.tsx` files that import `@pyreon/primitives`. Powers `pyreon doctor
// --check-native`.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditNative } from '../native-audit'

let dir: string
const write = (rel: string, src: string) => {
  const full = join(dir, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, src)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-native-audit-'))
  writeFileSync(join(dir, 'package.json'), '{"name":"app"}')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('auditNative', () => {
  it('flags a web-only-package import in a multiplatform file', () => {
    write(
      'src/App.tsx',
      `import { Stack } from '@pyreon/primitives'\nimport { Chart } from '@pyreon/charts'\nexport function App() { return (<Stack />) }`,
    )
    const r = auditNative(dir)
    expect(r.summary.multiplatformFiles).toBe(1)
    const f = r.findings.find((x) => x.code === 'web-only-package-import')
    expect(f).toBeDefined()
    expect(f!.message).toContain('@pyreon/charts')
    expect(f!.message).toContain('WebView')
  })

  it('flags top-level interface / TS enum / class as native-unsupported-decl', () => {
    write(
      'src/Comp.tsx',
      `import { Text } from '@pyreon/primitives'\ninterface Todo { id: number }\nenum Color { Red }\nclass Thing {}\nexport function Comp() { return (<Text>x</Text>) }`,
    )
    const r = auditNative(dir)
    const decls = r.findings.filter((x) => x.code === 'native-unsupported-decl')
    expect(decls.length).toBe(3)
    expect(decls.map((d) => d.message).join('\n')).toContain('type Todo = {')
    expect(decls.map((d) => d.message).join('\n')).toContain("'a' | 'b'")
  })

  it('does NOT flag a file that does not import @pyreon/primitives (scoping)', () => {
    // charts + interface, but no primitives import → not a multiplatform file.
    write(
      'src/WebOnly.tsx',
      `import { Chart } from '@pyreon/charts'\ninterface Z { a: number }\nexport const x = 1`,
    )
    const r = auditNative(dir)
    expect(r.summary.multiplatformFiles).toBe(0)
    expect(r.findings).toHaveLength(0)
  })

  it('clean multiplatform file → no findings', () => {
    write(
      'src/Clean.tsx',
      `import { Stack, Text } from '@pyreon/primitives'\ntype Todo = { id: number }\nexport function Clean() { return (<Stack><Text>ok</Text></Stack>) }`,
    )
    const r = auditNative(dir)
    expect(r.summary.multiplatformFiles).toBe(1)
    expect(r.findings).toHaveLength(0)
  })

  it('matches web-only subpath imports (e.g. @pyreon/charts/manual)', () => {
    write(
      'src/Sub.tsx',
      `import { Stack } from '@pyreon/primitives'\nimport { x } from '@pyreon/charts/manual'\nexport function Sub() { return (<Stack />) }`,
    )
    const r = auditNative(dir)
    expect(r.findings.some((f) => f.code === 'web-only-package-import')).toBe(true)
  })
})
