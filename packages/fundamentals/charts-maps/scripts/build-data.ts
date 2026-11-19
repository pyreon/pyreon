#!/usr/bin/env bun
/**
 * Regenerates `src/world-110m.ts` and `src/us-states.ts` from their sources (see SOURCES.md).
 *
 *   bun scripts/build-data.ts            # download (cached in a temp dir), verify checksums, convert, write
 *   bun scripts/build-data.ts --offline <dir>   # read the already-downloaded source files from <dir>
 *
 * Nothing here runs at install or build time of a consumer; the generated files are committed. The conversion is
 * deterministic: the same source bytes give the same output bytes.
 *
 * Steps, per map:
 *   1. fetch the source file and CHECK its sha256 against the one recorded below (a changed upstream file stops here);
 *   2. world: read the Natural Earth GeoJSON; US: unzip the Census shapefile and read it with `shapefile`;
 *   3. keep only the properties the map exposes, set the feature id;
 *   4. `topojson-server` builds the topology (shared borders become shared arcs) and quantises it to the stated grid;
 *   5. no further simplification: both sources are already the generalised scale (Natural Earth 1:110m, Census
 *      cartographic boundary 1:20,000,000), so the "simplification tolerance" is the source's own;
 *   6. write a TypeScript module that default-exports a `MapModule`.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error no types shipped
import { read as readShapefile } from 'shapefile'
// @ts-expect-error no types shipped
import { topology } from 'topojson-server'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'src')

interface Source {
  id: string
  url: string
  file: string
  sha256: string
}

const SOURCES: Record<string, Source> = {
  world: {
    id: 'Natural Earth 1:110m Admin 0 - Countries, v5.1.2 (GeoJSON from the natural-earth-vector repository, tag v5.1.2)',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson',
    file: 'ne_110m_admin_0_countries.geojson',
    sha256: '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
  },
  us: {
    id: 'US Census Bureau cartographic boundary file, 2023, states, 1:20,000,000',
    url: 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_20m.zip',
    file: 'cb_2023_us_state_20m.zip',
    sha256: '0fd2d6562708ff8182c00d5d25b5556d049ecf2794d97b89ed2dac4d5e9e2c8d',
  },
}

/** Topology quantisation: the number of grid steps across each axis (positions snap to it). */
const QUANTISE = { world: 1e4, us: 1e5 } as const

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex')

async function fetchSource(s: Source, dir: string): Promise<Buffer> {
  const path = join(dir, s.file)
  let buf: Buffer
  if (existsSync(path)) buf = readFileSync(path)
  else {
    const res = await fetch(s.url)
    if (!res.ok) throw new Error(`[Pyreon] fetch ${s.url}: ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(path, buf)
  }
  const got = sha256(buf)
  if (got !== s.sha256) throw new Error(`[Pyreon] ${s.file}: sha256 ${got} is not the recorded ${s.sha256}. The upstream file changed: review it, then update SOURCES.md and this script.`)

  return buf
}

interface Feature { type: 'Feature'; id?: string | number; properties: Record<string, unknown>; geometry: unknown }

function worldFeatures(buf: Buffer): Feature[] {
  const geo = JSON.parse(buf.toString('utf8')) as { features: { properties: Record<string, unknown>; geometry: unknown }[] }
  return geo.features.map((f) => {
    const p = f.properties
    // `ISO_A3_EH` fixes the -99 Natural Earth leaves on France, Norway and a few others; ADM0_A3 for what still has none.
    const iso3 = String(p.ISO_A3_EH ?? '') !== '-99' && p.ISO_A3_EH !== undefined ? String(p.ISO_A3_EH) : String(p.ADM0_A3)
    return { type: 'Feature', id: iso3, properties: { name: p.NAME, iso3, iso2: p.ISO_A2_EH === '-99' ? undefined : p.ISO_A2_EH, continent: p.CONTINENT }, geometry: f.geometry }
  })
}

async function usFeatures(buf: Buffer): Promise<Feature[]> {
  const dir = mkdtempSync(join(tmpdir(), 'charts-maps-us-'))
  const zip = join(dir, 'in.zip')
  writeFileSync(zip, buf)
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
  const shp = readdirShp(dir)
  const fc = (await readShapefile(shp, shp.replace(/\.shp$/, '.dbf'))) as { features: { properties: Record<string, unknown>; geometry: unknown }[] }

  return fc.features.map((f) => ({ type: 'Feature', id: String(f.properties.STATEFP), properties: { name: f.properties.NAME, abbr: f.properties.STUSPS, fips: String(f.properties.STATEFP) }, geometry: f.geometry }))
}

function readdirShp(dir: string): string {
  const out = execFileSync('ls', [dir]).toString().split('\n').find((n) => n.endsWith('.shp'))
  if (out === undefined) throw new Error(`[Pyreon] no .shp in ${dir}`)
  return join(dir, out)
}

interface ModuleSpec { topo: unknown; object: string; projection: string; nameProperty: string; idProperty: string; header: string }

function moduleSource(m: ModuleSpec): string {
  const { topo, object, projection, nameProperty, idProperty, header } = m

  return `// GENERATED by scripts/build-data.ts — do not edit. ${header}\n// Source, licence and the conversion steps: SOURCES.md.\nimport type { MapModule, Topology } from './types'\n\nconst data = ${JSON.stringify(topo)} as unknown as Topology\n\nconst map: MapModule = { data, object: ${JSON.stringify(object)}, projection: ${JSON.stringify(projection)}, nameProperty: ${JSON.stringify(nameProperty)}, idProperty: ${JSON.stringify(idProperty)} }\n\nexport default map\nexport { data }\n`
}

async function main(): Promise<void> {
  const offline = process.argv.indexOf('--offline')
  const dir = offline >= 0 ? process.argv[offline + 1]! : mkdtempSync(join(tmpdir(), 'charts-maps-src-'))
  mkdirSync(dir, { recursive: true })

  const world = await fetchSource(SOURCES.world!, dir)
  const wTopo = topology({ countries: { type: 'FeatureCollection', features: worldFeatures(world) } }, QUANTISE.world)
  writeFileSync(join(OUT, 'world-110m.ts'), moduleSource({ topo: wTopo, object: 'countries', projection: 'equalEarth', nameProperty: 'name', idProperty: 'id', header: `Natural Earth 1:110m countries, public domain. ${SOURCES.world!.id}.` }))

  const us = await fetchSource(SOURCES.us!, dir)
  const uTopo = topology({ states: { type: 'FeatureCollection', features: await usFeatures(us) } }, QUANTISE.us)
  writeFileSync(join(OUT, 'us-states.ts'), moduleSource({ topo: uTopo, object: 'states', projection: 'albersUsa', nameProperty: 'name', idProperty: 'id', header: `US Census cartographic boundary states 1:20m, public domain. ${SOURCES.us!.id}.` }))
  console.log('wrote src/world-110m.ts and src/us-states.ts')
}

await main()
