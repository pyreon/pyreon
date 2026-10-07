import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Replace the stalled runner mirror; preserve suites, components and signing options. */
export function ubuntuArchiveSource(source: string): string {
  return source.replace(/https?:\/\/azure\.archive\.ubuntu\.com(?=\/ubuntu(?:[/\s]|$))/g, 'https://archive.ubuntu.com')
}

export function setCiAptMirror(root = '/etc/apt'): string[] {
  const files = [join(root, 'sources.list')]
  try {
    files.push(...readdirSync(join(root, 'sources.list.d')).filter((name) => /\.(?:list|sources)$/.test(name)).map((name) => join(root, 'sources.list.d', name)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const changed: string[] = []
  for (const file of files) {
    let source: string
    try { source = readFileSync(file, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    const replacement = ubuntuArchiveSource(source)
    if (replacement === source) continue
    writeFileSync(file, replacement)
    changed.push(file)
  }
  return changed
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  for (const file of setCiAptMirror(process.argv[2])) console.log(`[pyreon CI] Ubuntu archive mirror: ${file}`)
}
