/**
 * ECharts option-key totality: every key the installed ECharts types define
 * is read by the facade, declared inert, or filed as a gap under a ledger row
 * that is therefore not complete. See `echarts-contract.ts` for the contract.
 *
 * The keys come from ECharts' OWN declarations through the TypeScript checker,
 * not from a list typed here, so a key this repo has never heard of still
 * appears — which is the point.
 */
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHART_CAPABILITIES } from './capability-inventory'
import { ECHARTS_COMPOSITE_TOP_KEYS, ECHARTS_CONTRACT_VERSION, ECHARTS_INERT_BY_TYPE, ECHARTS_INERT_KEYS, ECHARTS_NOT_HONOURED_BY_TYPE, ECHARTS_SERIES_GAPS, ECHARTS_TOP_GAPS } from './echarts-contract'
import { KNOWN_SERIES, KNOWN_TOP } from './option'
import { FAMILY_KNOWN_TOP, FAMILY_TYPES, KNOWN_BY_FAMILY } from './option-family'

const packageRoot = existsSync('src/engine/option.ts') ? '.' : 'packages/fundamentals/charts'
const echartsRoot = resolve(packageRoot, 'node_modules/echarts')

interface Contract {
  top: string[]
  byType: Map<string, Set<string>>
}

/** The option keys ECharts' own types declare: `EChartsOption`'s properties, and each series type's. */
function readContract(): Contract {
  const entry = resolve(echartsRoot, 'types/dist/echarts.d.ts')
  const program = ts.createProgram([entry], { strict: true, noEmit: true, skipLibCheck: true })
  const checker = program.getTypeChecker()
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!
  const optionSymbol = checker.getExportsOfModule(moduleSymbol).find((s) => s.name === 'EChartsOption')!
  const optionType = checker.getDeclaredTypeOfSymbol(optionSymbol)
  const top = checker.getPropertiesOfType(optionType).map((p) => p.name)
  const seriesType = checker.getNonNullableType(checker.getTypeOfSymbol(checker.getPropertyOfType(optionType, 'series')!))
  const byType = new Map<string, Set<string>>()
  for (const member of seriesType.isUnion() ? seriesType.types : [seriesType]) {
    const element = checker.isArrayType(member) ? checker.getTypeArguments(member as ts.TypeReference)[0]! : member
    for (const variant of element.isUnion() ? element.types : [element]) {
      const typeProp = checker.getPropertyOfType(variant, 'type')
      if (typeProp === undefined) continue
      const typeOfType = checker.getTypeOfSymbol(typeProp)
      for (const lit of typeOfType.isUnion() ? typeOfType.types : [typeOfType]) {
        if (!lit.isStringLiteral()) continue
        const keys = byType.get(lit.value) ?? new Set<string>()
        for (const p of checker.getPropertiesOfType(variant)) keys.add(p.name)
        byType.set(lit.value, keys)
      }
    }
  }
  return { top, byType }
}

/**
 * The facade's source with the `KNOWN_*` declarations removed, so "read"
 * means a key some CODE consumes rather than a key a list merely names.
 */
function facadeSource(): string {
  const dir = resolve(packageRoot, 'src/engine')
  let src = ''
  for (const f of readdirSync(dir)) {
    if (!/\.(ts|tsx)$/.test(f) || /\.test\./.test(f) || f === 'echarts-contract.ts' || f === 'capability-inventory.ts') continue
    src += readFileSync(resolve(dir, f), 'utf8') + '\n'
  }
  return src
    .replace(/(export )?const (KNOWN_TOP|KNOWN_SERIES|FAMILY_KNOWN_TOP)[^\n]*\n?(\s+'[^\n]*\n)*\]\)/g, '')
    .replace(/export const KNOWN_BY_FAMILY[\s\S]*?\n\}\n/, '')
}

const contract = readContract()
const source = facadeSource()
const isRead = (key: string): boolean => new RegExp(`['"\`]${key}['"\`]|\\.${key}\\b`).test(source)
const knownFor = (type: string): ReadonlySet<string> => (FAMILY_TYPES.has(type) ? KNOWN_BY_FAMILY[type] ?? new Set() : KNOWN_SERIES)
const rowById = new Map(CHART_CAPABILITIES.filter((r) => r.mode === 'direct').map((r) => [r.id, r]))

describe('ECharts option-key totality', () => {
  it('measures the ECharts version the contract was classified against', () => {
    const version = (JSON.parse(readFileSync(resolve(echartsRoot, 'package.json'), 'utf8')) as { version: string }).version
    expect(version, 'echarts moved: re-run the classification and update ECHARTS_CONTRACT_VERSION').toBe(ECHARTS_CONTRACT_VERSION)
    // Guards the enumeration itself: a checker walk that found nothing would pass every totality check vacuously.
    expect(contract.top.length).toBeGreaterThan(40)
    expect(contract.byType.size).toBeGreaterThanOrEqual(23)
  })

  it('every top-level ECharts key is read, inert, or a named gap', () => {
    const unclassified = contract.top.filter((k) => {
      const read = (KNOWN_TOP.has(k) || FAMILY_KNOWN_TOP.has(k) || ECHARTS_COMPOSITE_TOP_KEYS.has(k)) && isRead(k)
      return !read && ECHARTS_INERT_KEYS[k] === undefined && ECHARTS_TOP_GAPS[k] === undefined
    })
    expect(unclassified).toEqual([])
  })

  it('every series key of every ECharts series type is read, inert, or a named gap', () => {
    const unclassified: string[] = []
    for (const [type, keys] of contract.byType) {
      const gaps = ECHARTS_SERIES_GAPS[type] ?? {}
      for (const k of keys) {
        const read = knownFor(type).has(k) && isRead(k)
        if (!read && ECHARTS_INERT_KEYS[k] === undefined && ECHARTS_INERT_BY_TYPE[type]?.[k] === undefined && gaps[k] === undefined) unclassified.push(`${type}.${k}`)
      }
    }
    expect(unclassified).toEqual([])
  })

  it('a per-type inert key names a real key of that type, one the facade does not also claim to read', () => {
    const bad: string[] = []
    for (const [type, keys] of Object.entries(ECHARTS_INERT_BY_TYPE)) {
      for (const k of Object.keys(keys)) {
        if (!contract.byType.get(type)?.has(k)) bad.push(`${type}.${k} (not a key of this type)`)
        else if (knownFor(type).has(k)) bad.push(`${type}.${k} (the facade reads it — it cannot also be inert)`)
      }
    }
    expect(bad).toEqual([])
  })

  it('a key the facade calls known is read by code — a known key nothing reads is a silent drop', () => {
    const silent: string[] = []
    for (const k of [...KNOWN_TOP, ...FAMILY_KNOWN_TOP]) if (!isRead(k)) silent.push(`top.${k}`)
    for (const k of KNOWN_SERIES) if (!isRead(k)) silent.push(`series.${k}`)
    for (const [family, keys] of Object.entries(KNOWN_BY_FAMILY)) for (const k of keys) if (!isRead(k)) silent.push(`${family}.${k}`)
    expect(silent, 'remove the key from the KNOWN set (it will then warn by name) or read it').toEqual([])
  })

  it('no gap entry is stale: each names a real ECharts key the facade still does not read', () => {
    const stale: string[] = []
    for (const k of Object.keys(ECHARTS_TOP_GAPS)) {
      if (!contract.top.includes(k)) stale.push(`top.${k} (not an ECharts key)`)
      else if ((KNOWN_TOP.has(k) || FAMILY_KNOWN_TOP.has(k)) && isRead(k)) stale.push(`top.${k} (now read — remove the gap)`)
    }
    for (const [type, gaps] of Object.entries(ECHARTS_SERIES_GAPS)) {
      const keys = contract.byType.get(type)
      for (const k of Object.keys(gaps)) {
        if (keys === undefined || !keys.has(k)) stale.push(`${type}.${k} (not an ECharts key)`)
        else if (knownFor(type).has(k) && isRead(k) && !(ECHARTS_NOT_HONOURED_BY_TYPE[type] ?? []).includes(k)) stale.push(`${type}.${k} (now read — remove the gap)`)
      }
    }
    expect(stale).toEqual([])
  })

  it('every gap names a ledger row, and that row is not complete on the web', () => {
    const entries = [...Object.entries(ECHARTS_TOP_GAPS).map(([k, r]) => [`top.${k}`, r] as const), ...Object.entries(ECHARTS_SERIES_GAPS).flatMap(([t, g]) => Object.entries(g).map(([k, r]) => [`${t}.${k}`, r] as const))]
    for (const [key, id] of entries) {
      const row = rowById.get(id)
      expect(row, `${key} names unknown ledger row ${id}`).toBeDefined()
      expect(row!.targets.web, `${key} is unmapped, so ${id} cannot be complete on the web`).not.toBe('complete')
    }
  })
})
