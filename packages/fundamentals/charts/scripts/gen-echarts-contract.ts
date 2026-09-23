#!/usr/bin/env bun
/**
 * Regenerate the gap tables in `src/engine/echarts-contract.ts` from the
 * installed ECharts types.
 *
 * Run after implementing an ECharts key (the key-totality test fails on a
 * STALE gap entry until it leaves the table) or after an `echarts` upgrade
 * (the test fails on the version pin and on every unclassified new key).
 *
 *   bun run gen:contract
 *
 * The classification rules below decide which ledger row a gap belongs to.
 * Everything above `export const ECHARTS_TOP_GAPS` in the target file is kept
 * verbatim; the tables after it are rewritten.
 */
import ts from 'typescript'
import { resolve } from 'node:path'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { KNOWN_TOP, KNOWN_SERIES } from '../src/engine/option'
import { FAMILY_KNOWN_TOP, KNOWN_BY_FAMILY, FAMILY_TYPES } from '../src/engine/option-family'
import { ECHARTS_INERT_BY_TYPE, ECHARTS_NOT_HONOURED_BY_TYPE } from '../src/engine/echarts-contract'

const entry = resolve(import.meta.dir, '../node_modules/echarts/types/dist/echarts.d.ts')
const program = ts.createProgram([entry], { strict: true, noEmit: true, skipLibCheck: true })
const checker = program.getTypeChecker()
const mod = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!
const optType = checker.getDeclaredTypeOfSymbol(checker.getExportsOfModule(mod).find((s) => s.name === 'EChartsOption')!)
const top = checker.getPropertiesOfType(optType).map((p) => p.name)
const st = checker.getNonNullableType(checker.getTypeOfSymbol(checker.getPropertyOfType(optType, 'series')!))
const byType = new Map<string, Set<string>>()
for (const m of st.isUnion() ? st.types : [st]) {
  const el = checker.isArrayType(m) ? checker.getTypeArguments(m as ts.TypeReference)[0]! : m
  for (const u of el.isUnion() ? el.types : [el]) {
    const tp = checker.getPropertyOfType(u, 'type'); if (!tp) continue
    const tt = checker.getTypeOfSymbol(tp)
    for (const l of (tt.isUnion() ? tt.types : [tt]).filter((x) => x.isStringLiteral()).map((x) => (x as ts.StringLiteralType).value)) {
      const set = byType.get(l) ?? new Set(); for (const p of checker.getPropertiesOfType(u)) set.add(p.name); byType.set(l, set)
    }
  }
}
let src = ''
const engineDir = resolve(import.meta.dir, '../src/engine')
for (const f of readdirSync(engineDir)) if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && f !== 'echarts-contract.ts' && f !== 'capability-inventory.ts') src += readFileSync(resolve(engineDir, f), 'utf8') + '\n'
src = src.replace(/(export )?const (KNOWN_TOP|KNOWN_SERIES|FAMILY_KNOWN_TOP)[^\n]*\n?(\s+'[^\n]*\n)*\]\)/g, '').replace(/export const KNOWN_BY_FAMILY[\s\S]*?\n\}\n/, '')
const read = (k: string) => new RegExp(`['"\`]${k}['"\`]|\\.${k}\\b`).test(src)

const INERT: Record<string, string> = {
  mainType: 'the component-type discriminator ECharts writes on itself, not an input that changes output',
  hoverLayerThreshold: 'a rendering-performance threshold with no visible effect on the chart',
  progressiveChunkMode: 'a scheduling detail of progressive rendering with no visible effect on the finished chart',
  legacyViewCoordSysCenterBase: 'a backward-compatibility switch for a layout bug in earlier ECharts versions',
  legacyMinMaxDontInverseAxis: 'a backward-compatibility switch for earlier ECharts behaviour',
}
const COORD: Record<string, string> = {
  xAxisId: 'coordinates.axes', yAxisId: 'coordinates.axes', xAxisIndex: 'coordinates.axes', yAxisIndex: 'coordinates.axes',
  polarId: 'coordinates.polar', polarIndex: 'coordinates.polar', calendarId: 'coordinates.calendar', calendarIndex: 'coordinates.calendar',
  geoId: 'coordinates.geo', geoIndex: 'coordinates.geo', matrixId: 'coordinates.matrix', matrixIndex: 'coordinates.matrix',
  singleAxisId: 'coordinates.single-axis', singleAxisIndex: 'coordinates.single-axis', radarId: 'series.radar', radarIndex: 'series.radar',
  parallelId: 'coordinates.parallel', parallelIndex: 'coordinates.parallel', coord: 'coordinates.matrix', coordinateSystemUsage: 'coordinates.matrix',
}
const rowFor = (k: string, famRow: string): string => {
  if (INERT[k]) return 'inert'
  if (k.startsWith('animation') || k === 'stateAnimation' || k === 'animationType' || k === 'animationTypeUpdate') return 'presentation.animation'
  if (k === 'universalTransition' || k === 'dataGroupId') return 'presentation.universal-transition'
  if (k === 'tooltip') return 'coordinates.tooltip'
  if (k === 'labelLine' || k === 'labelLayout' || k === 'edgeLabel' || k === 'endLabel' || k === 'upperLabel') return 'presentation.labels-rich-text'
  if (k === 'id') return 'data.option-merge'
  if (['z', 'zlevel', 'blendMode'].includes(k)) return 'presentation.layering'
  if (['silent', 'cursor', 'legendHoverLink', 'triggerEvent', 'triggerLineEvent'].includes(k)) return 'runtime.events'
  if (['select', 'selectedMap', 'selectedMode', 'selectedOffset', 'blur', 'emphasis'].includes(k)) return 'presentation.states'
  if (['seriesLayoutBy', 'datasetId', 'datasetIndex', 'sourceHeader', 'dimensions', 'encode'].includes(k)) return 'data.dimensions-encode'
  if (['progressive', 'progressiveThreshold', 'large', 'largeThreshold'].includes(k)) return 'data.progressive-large'
  if (k === 'markPoint') return 'coordinates.mark-point'
  if (k === 'markLine') return 'coordinates.mark-line'
  if (k === 'markArea') return 'coordinates.mark-area'
  if (COORD[k]) return COORD[k]!
  if (k === 'colorBy' || k === 'colorLayer') return 'presentation.palette'
  if (k === 'coordinateSystem') return 'series.multi-series'
  return famRow
}
const FAM_ROW: Record<string, string> = { effectScatter: 'series.effect-scatter', pictorialBar: 'series.pictorial-bar', themeRiver: 'series.river' }
const TOP_ROW: Record<string, string> = {
  matrix: 'coordinates.matrix', thumbnail: 'coordinates.thumbnail', axisPointer: 'coordinates.axis-pointer', media: 'coordinates.media',
  darkMode: 'presentation.theme', useUTC: 'presentation.locale', colorLayer: 'presentation.palette', stateAnimation: 'presentation.animation',
}
const COMPOSITE_TOP = new Set(['timeline', 'options', 'baseOption'])
const topGaps: Record<string, string> = {}
const topInert: string[] = []
for (const k of top) {
  if ((KNOWN_TOP.has(k) || FAMILY_KNOWN_TOP.has(k)) && read(k)) continue
  if (COMPOSITE_TOP.has(k) && read(k)) continue
  const r = INERT[k] ? 'inert' : k.startsWith('animation') ? 'presentation.animation' : TOP_ROW[k] ?? 'data.key-totality'
  if (r === 'inert') topInert.push(k); else topGaps[k] = r
}
const seriesGaps: Record<string, Record<string, string>> = {}
for (const [t, keys] of [...byType].sort()) {
  const known = FAMILY_TYPES.has(t) ? KNOWN_BY_FAMILY[t] ?? new Set() : KNOWN_SERIES
  const fam = FAM_ROW[t] ?? `series.${t}`
  const g: Record<string, string> = {}
  for (const k of [...keys].sort()) {
    if (known.has(k) && read(k) && !(ECHARTS_NOT_HONOURED_BY_TYPE[t] ?? []).includes(k)) continue
    if (ECHARTS_INERT_BY_TYPE[t]?.[k] !== undefined) continue
    const r = rowFor(k, fam)
    if (r === 'inert') continue
    g[k] = r
  }
  seriesGaps[t] = g
}
const lit = (o: Record<string, string>, ind: string) => Object.entries(o).map(([k, v]) => `${ind}${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : `'${k}'`}: '${v}',`).join('\n')
let out = ''
out += `export const ECHARTS_TOP_GAPS: Readonly<Record<string, string>> = {\n${lit(topGaps, '  ')}\n}\n\n`
out += `export const ECHARTS_SERIES_GAPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {\n`
for (const [t, g] of Object.entries(seriesGaps)) out += `  ${t}: {\n${lit(g, '    ')}\n  },\n`
out += `}\n`
const target = resolve(engineDir, 'echarts-contract.ts')
const current = readFileSync(target, 'utf8')
const marker = current.indexOf('export const ECHARTS_TOP_GAPS')
if (marker < 0) throw new Error('[Pyreon] echarts-contract.ts has no ECHARTS_TOP_GAPS table to replace')
writeFileSync(target, current.slice(0, marker) + out)
const rows = new Set<string>([...Object.values(topGaps), ...Object.values(seriesGaps).flatMap((g) => Object.values(g))])
console.log(`[gen:contract] ${Object.keys(topGaps).length} top-level + ${Object.values(seriesGaps).reduce((a, g) => a + Object.keys(g).length, 0)} series gaps across ${rows.size} ledger rows (inert top: ${topInert.join(', ') || 'none'})`)
