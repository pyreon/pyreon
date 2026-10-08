import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Replace the stalled runner mirror; preserve suites, components and signing options. */
export function ubuntuArchiveSource(source: string): string {
  return source.replace(
    /https?:\/\/azure\.archive\.ubuntu\.com(?=\/ubuntu(?:[/\s]|$))/g,
    'https://archive.ubuntu.com',
  )
}

export function setCiAptMirror(root = '/etc/apt'): string[] {
  const files = [join(root, 'sources.list')]
  try {
    files.push(
      ...readdirSync(join(root, 'sources.list.d'))
        .filter((name) => /\.(?:list|sources)$/.test(name))
        .map((name) => join(root, 'sources.list.d', name)),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const changed: string[] = []
  for (const file of files) {
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    // Ubuntu runners may select their archive through a local mirror list.
    // Follow only references in active source entries; unrelated .txt files and backups stay untouched.
    const entries = file.endsWith('.sources') ? source.split(/\n\s*\n/) : source.split('\n')
    for (const entry of entries) {
      const active = entry
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n')
      if (/^Enabled:\s*no\s*$/im.test(active)) continue
      for (const match of active.matchAll(/\bmirror\+file:([^\s#]+)/g)) {
        const mirror = fileURLToPath(`file:${match[1]}`)
        if (!files.includes(mirror)) files.push(mirror)
      }
    }
    const replacement = ubuntuArchiveSource(source)
    if (replacement === source) continue
    writeFileSync(file, replacement)
    changed.push(file)
  }
  return changed
}

if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
) {
  for (const file of setCiAptMirror(process.argv[2]))
    console.log(`[pyreon CI] Ubuntu archive mirror: ${file}`)
}
