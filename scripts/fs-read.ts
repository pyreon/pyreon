/**
 * fs-read — "read it if it is there" as ONE operation.
 *
 * `existsSync(path)` followed by a read of `path` is two operations, and the
 * file can change or vanish between them (CodeQL `js/file-system-race`). The
 * check also adds nothing: the read already reports a missing file. So these
 * do the read and translate "not there" into a value.
 *
 * No Bun API, so tests can import it.
 */

import { type Dirent, readdirSync, readFileSync } from 'node:fs'

const isMissing = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** The file's text, or `undefined` when it does not exist. Any other error throws. */
export function readTextIfExists(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    if (isMissing(err)) return undefined
    throw err
  }
}

/** The directory's entries, or none when it does not exist or is not a directory. */
export function listDirIfExists(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
}
