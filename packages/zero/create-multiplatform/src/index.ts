// `create-multiplatform` CLI — scaffolds a new web + iOS + Android Pyreon
// project sharing one `src/App.tsx`. Thin I/O wrapper over `buildScaffold`
// (the pure generator in `scaffold.ts`, which holds all templates + is
// unit-tested in isolation).
//
// Usage:
//   npx create-multiplatform <project-name>
//   npx create-multiplatform my-app --dir ./apps/my-app

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { buildScaffold } from './scaffold'

export interface CliArgs {
  name: string
  dir: string
}

/** Parse argv (after `node script`) into a name + target dir. */
export function parseArgs(argv: string[]): CliArgs {
  let name: string | undefined
  let dir: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir' || a === '-d') {
      dir = argv[++i]
    } else if (a !== undefined && !a.startsWith('-') && name === undefined) {
      name = a
    }
  }
  if (name === undefined || name.length === 0) {
    throw new Error('Usage: create-multiplatform <project-name> [--dir <path>]')
  }
  return { name, dir: dir ?? name }
}

/** Write the scaffold's file tree under `targetDir`. */
export async function writeScaffold(name: string, targetDir: string): Promise<string[]> {
  const files = buildScaffold({ name })
  const root = resolve(targetDir)
  for (const f of files) {
    const full = join(root, f.path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, f.content, 'utf8')
  }
  return files.map((f) => f.path)
}

export async function main(argv: string[]): Promise<void> {
  const { name, dir } = parseArgs(argv)
  const written = await writeScaffold(name, dir)
  // eslint-disable-next-line no-console
  console.log(
    `[create-multiplatform] scaffolded "${name}" → ${dir}/ (${written.length} files)\n` +
      `  next: cd ${dir} && npm install && npm run dev`,
  )
}
