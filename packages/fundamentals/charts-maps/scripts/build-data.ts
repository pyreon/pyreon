#!/usr/bin/env bun
/**
 * Regenerates `src/world-110m.ts` and `src/us-states.ts` from their sources (see SOURCES.md).
 *
 *   bun scripts/build-data.ts            # download (into memory), verify checksums, convert, write
 *   bun scripts/build-data.ts --offline <dir>   # read the already-downloaded source files from <dir>
 *
 * A source is checked against its recorded SHA-256 before anything reads it, and a download is never written to disk:
 * the Census zip is unpacked in memory (`unzip` below), so no unverified byte is cached and no file is checked and then
 * written.
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
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
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

/** The source's bytes, from `offlineDir` when given, else downloaded into memory; refused unless the checksum matches. */
async function loadSource(s: Source, offlineDir: string | undefined): Promise<Buffer> {
  let buf: Buffer
  if (offlineDir !== undefined) buf = readFileSync(join(offlineDir, s.file))
  else {
    const res = await fetch(s.url)
    if (!res.ok) throw new Error(`[Pyreon] fetch ${s.url}: ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
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

/**
 * The files of a zip archive, in memory: the end-of-central-directory record, then each central-directory entry and its
 * local header. Stored (0) and deflated (8) entries only, no zip64: enough for the Census cartographic-boundary zip,
 * and anything else throws rather than guessing.
 */
function unzip(zip: Buffer): Map<string, Buffer> {
  let eocd = zip.length - 22
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('[Pyreon] not a zip archive: no end-of-central-directory record')
  const count = zip.readUInt16LE(eocd + 10)
  let at = zip.readUInt32LE(eocd + 16)
  const files = new Map<string, Buffer>()
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`[Pyreon] zip: bad central-directory entry at ${at}`)
    const method = zip.readUInt16LE(at + 10)
    const size = zip.readUInt32LE(at + 20)
    const nameLen = zip.readUInt16LE(at + 28)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`[Pyreon] zip: bad local header for ${name}`)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const raw = zip.subarray(start, start + size)
    if (method === 0) files.set(name, raw)
    else if (method === 8) files.set(name, inflateRawSync(raw))
    else throw new Error(`[Pyreon] zip: ${name} uses compression method ${method}; only stored and deflate are read`)
  }
  return files
}

/** An exact-size ArrayBuffer copy (a Node Buffer may be a view into a larger pool). */
const arrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

async function usFeatures(buf: Buffer): Promise<Feature[]> {
  const files = unzip(buf)
  const shpName = [...files.keys()].find((n) => n.endsWith('.shp'))
  if (shpName === undefined) throw new Error(`[Pyreon] no .shp in the zip (${[...files.keys()].join(', ')})`)
  const dbf = files.get(shpName.replace(/\.shp$/, '.dbf'))
  if (dbf === undefined) throw new Error(`[Pyreon] no .dbf next to ${shpName} in the zip`)
  const fc = (await readShapefile(arrayBuffer(files.get(shpName)!), arrayBuffer(dbf))) as { features: { properties: Record<string, unknown>; geometry: unknown }[] }

  // Puerto Rico (FIPS 72) is left out: the Albers USA composite has no inset for it, so it would be projected far off the
  // map and shrink everything else to make room.
  return fc.features
    .filter((f) => String(f.properties.STATEFP) !== '72')
    .map((f) => ({ type: 'Feature', id: String(f.properties.STATEFP), properties: { name: f.properties.NAME, abbr: f.properties.STUSPS, fips: String(f.properties.STATEFP) }, geometry: f.geometry }))
}

interface ModuleSpec { topo: unknown; object: string; projection: string; nameProperty: string; idProperty: string; header: string }

function moduleSource(m: ModuleSpec): string {
  const { topo, object, projection, nameProperty, idProperty, header } = m

  return `// GENERATED by scripts/build-data.ts — do not edit. ${header}\n// Source, licence and the conversion steps: SOURCES.md.\nimport type { MapModule, Topology } from './types'\n\nconst data = ${JSON.stringify(topo)} as unknown as Topology\n\nconst map: MapModule = { data, object: ${JSON.stringify(object)}, projection: ${JSON.stringify(projection)}, nameProperty: ${JSON.stringify(nameProperty)}, idProperty: ${JSON.stringify(idProperty)} }\n\nexport default map\nexport { data }\n`
}

async function main(): Promise<void> {
  const offline = process.argv.indexOf('--offline')
  const dir = offline >= 0 ? process.argv[offline + 1] : undefined
  if (offline >= 0 && dir === undefined) throw new Error('[Pyreon] --offline needs the directory holding the downloaded sources')

  const world = await loadSource(SOURCES.world!, dir)
  const wTopo = topology({ countries: { type: 'FeatureCollection', features: worldFeatures(world) } }, QUANTISE.world)
  writeFileSync(join(OUT, 'world-110m.ts'), moduleSource({ topo: wTopo, object: 'countries', projection: 'equalEarth', nameProperty: 'name', idProperty: 'id', header: `Natural Earth 1:110m countries, public domain. ${SOURCES.world!.id}.` }))

  const us = await loadSource(SOURCES.us!, dir)
  const uTopo = topology({ states: { type: 'FeatureCollection', features: await usFeatures(us) } }, QUANTISE.us)
  writeFileSync(join(OUT, 'us-states.ts'), moduleSource({ topo: uTopo, object: 'states', projection: 'albersUsa', nameProperty: 'name', idProperty: 'id', header: `US Census cartographic boundary states 1:20m, public domain. ${SOURCES.us!.id}.` }))
  console.log('wrote src/world-110m.ts and src/us-states.ts')
}

await main()
