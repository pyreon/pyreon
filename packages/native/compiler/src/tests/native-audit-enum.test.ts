/**
 * `native-unsupported-decl` and TypeScript enums (#4363). Since #4146 PMTC
 * lowers a string enum and a numeric enum with literal members
 * (`ts-enum-desugar.ts`), but the audit still reported EVERY top-level enum as
 * "not compiled to native" and told the author to rewrite it as a union. The
 * audit now asks the compiler's own classifier (`ts-enum-shape.ts`), so both
 * agree, and each verdict is checked against what PMTC actually does.
 *
 * Bisect-verified: with the old rule the "lowers" specs report
 * `native-unsupported-decl` for `Plan` / `Dir`.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditNative, detectNativePatterns } from '../native-audit'
import { transform } from '../index'

const shared = (body: string) => `import { Text } from '@pyreon/primitives'\n${body}\nexport function C() { return <Text>x</Text> }\n`
const flagged = (src: string) =>
  detectNativePatterns(src, 'c.tsx').filter((d) => d.code === 'native-unsupported-decl')
const pmtcWarnsEnum = (src: string) =>
  transform(src, { target: 'swift' }).warnings.some((w) => /enum/.test(String(w)) && /NOT compiled to native/.test(String(w)))

describe('native audit — enums', () => {
  it.each([
    ['a string enum (the report)', "enum Plan { Free = 'free', Pro = 'pro' }"],
    ['a numeric enum with auto-increment', 'export enum Dir { Up, Down = 5, Left }'],
    ['a negative numeric member', 'enum Level { Low = -1, High = 1 }'],
  ])('lowers, so it is not reported: %s', (_name, decl) => {
    const src = shared(decl)
    expect(pmtcWarnsEnum(src), 'PMTC lowers it').toBe(false)
    expect(flagged(src)).toEqual([])
  })

  it.each([
    ['mixed string / number members', "enum Mixed { A = 'a', B = 1 }"],
    ['a computed initializer', 'enum Size { S = 1 << 1, M = 4 }'],
    ['a declared enum', 'declare enum Ext { A }'],
  ])('does not lower, so it is reported: %s', (_name, decl) => {
    const src = shared(decl)
    expect(pmtcWarnsEnum(src), 'PMTC warns about it').toBe(true)
    const diags = flagged(src)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.suggested).toContain('literal of one kind')
  })

  it('the project audit applies the same rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-native-enum-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}')
    writeFileSync(join(dir, 'src', 'A.tsx'), shared("export enum Plan { Free = 'free', Pro = 'pro' }"))
    writeFileSync(join(dir, 'src', 'B.tsx'), shared("enum Mixed { A = 'a', B = 1 }"))
    const decls = auditNative(dir).findings.filter((f) => f.code === 'native-unsupported-decl')
    expect(decls.map((d) => d.message.match(/`TS enum (\w+)`/)?.[1])).toEqual(['Mixed'])
  })
})
