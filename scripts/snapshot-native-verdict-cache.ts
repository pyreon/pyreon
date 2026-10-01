import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const ENTRY = /^(?:probe-)?[a-f0-9]{64}\.json$/

/** Copy complete atomic verdict/probe records to a directory no worker writes. */
export function snapshotNativeVerdicts(source: string, destination: string): number {
  const from = resolve(source)
  const to = resolve(destination)
  const inside = (parent: string, child: string) => {
    const path = relative(parent, child)
    return path === '' || (path !== '..' && !path.startsWith('../') && !isAbsolute(path))
  }
  if (inside(from, to) || inside(to, from))
    throw new Error('[Pyreon] Cache snapshot paths must be separate directories.')
  mkdirSync(dirname(to), { recursive: true })
  const staging = mkdtempSync(join(dirname(to), '.native-verdict-snapshot-'))
  let copied = 0
  try {
    let names: string[]
    try {
      names = readdirSync(from)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      names = []
    }
    for (const name of names) {
      // Cache writers rename completed JSON records atomically. Temporary
      // files, daemon binaries and symlinks must never enter this archive.
      if (!ENTRY.test(name)) continue
      let fd: number | undefined
      try {
        fd = openSync(join(from, name), constants.O_RDONLY | constants.O_NOFOLLOW)
        if (!fstatSync(fd).isFile()) continue
        const text = readFileSync(fd, 'utf8')
        try {
          JSON.parse(text)
        } catch {
          continue
        }
        writeFileSync(join(staging, name), text, { flag: 'wx', mode: 0o600 })
        copied++
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ELOOP') throw error
      } finally {
        if (fd !== undefined) closeSync(fd)
      }
    }
    rmSync(to, { recursive: true, force: true })
    renameSync(staging, to)
    return copied
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const [source, destination] = process.argv.slice(2)
  if (!source || !destination)
    throw new Error('[Pyreon] Pass source and destination cache directories.')
  const copied = snapshotNativeVerdicts(source, destination)
  console.log(`[native-cache] Copied ${copied} complete records from ${source} to ${destination}`)
}
