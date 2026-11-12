import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
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

export interface SnapshotOptions {
  /**
   * Keep the destination's existing records and add the source's to them,
   * instead of replacing the destination. Records are content-addressed, so a
   * name present on both sides is the same verdict and either copy may win.
   *
   * This is what lets a job hydrate from TWO restored stores (the default
   * branch's and the pull request's own): the second hydrate must not discard
   * the first. Saving never merges: the archive is rebuilt from the live store
   * alone, so a record the validator evicted does not ride back in.
   */
  merge?: boolean
}

/** Copy complete atomic records from both verdict stores to an idle directory. */
export function snapshotNativeVerdicts(
  source: string,
  destination: string,
  options: SnapshotOptions = {},
): number {
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
    const copyStore = (root: string, store: string): void => {
      const input = join(root, store)
      const output = join(staging, store)
      let names: string[]
      try {
        // Only the two owned namespaces are archived. Never traverse directory
        // symlinks or unrelated cache trees (which can contain live binaries).
        if (!lstatSync(input).isDirectory()) return
        names = readdirSync(input)
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
          fd = openSync(join(input, name), constants.O_RDONLY | constants.O_NOFOLLOW)
          if (!fstatSync(fd).isFile()) continue
          const text = readFileSync(fd, 'utf8')
          try {
            JSON.parse(text)
          } catch {
            continue
          }
          mkdirSync(output, { recursive: true })
          writeFileSync(join(output, name), text, { flag: 'wx', mode: 0o600 })
          copied++
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          // EEXIST: a merge already staged this name from the source.
          if (code !== 'ENOENT' && code !== 'ELOOP' && code !== 'EEXIST') throw error
        } finally {
          if (fd !== undefined) closeSync(fd)
        }
      }
    }
    for (const root of options.merge === true ? [from, to] : [from]) {
      copyStore(root, '')
      copyStore(root, 'kotlin-runtime')
    }
    rmSync(to, { recursive: true, force: true })
    renameSync(staging, to)
    return copied
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const merge = args.includes('--merge')
  const [source, destination, ...extra] = args.filter((arg) => arg !== '--merge')
  if (!source || !destination || extra.length > 0)
    throw new Error(
      '[Pyreon] Usage: snapshot-native-verdict-cache.ts <source> <destination> [--merge]. Pass exactly two cache directories.',
    )
  const copied = snapshotNativeVerdicts(source, destination, { merge })
  console.log(
    merge
      ? `[native-cache] Merged ${source} into ${destination}: ${copied} complete records`
      : `[native-cache] Copied ${copied} complete records from ${source} to ${destination}`,
  )
}
