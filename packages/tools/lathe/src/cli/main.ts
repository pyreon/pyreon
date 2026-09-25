/**
 * The `lathe` bin's real entry.
 *
 * Kept separate from `run.ts` so the pure half stays testable, and so the bin
 * is the only place that touches `node:fs`, `process` or the config loader.
 */

import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { version as LATHE_VERSION } from '../../package.json' with { type: 'json' }
import type { LatheSection } from '../core/config'
import { loadConfig, type LoadedConfig } from './config-file'
import { pullSpec } from './pull'
import { shouldColor } from './report'
import { parseArgv, run, type Argv, type Fs } from './run'

const realFs: Fs = {
  read: (p) => readFileSync(p, 'utf8'),
  write: (p, c) => writeFileSync(p, c, 'utf8'),
  exists: (p) => existsSync(p),
  mkdirp: (p) => mkdirSync(p, { recursive: true }),
  remove: (p) => rmSync(p, { force: true }),
  join: (...parts) => join(...parts),
}

export { findConfigFile, loadConfig, rebase, type LoadedConfig } from './config-file'

export async function main(argvRaw: readonly string[], cwd: string): Promise<number> {
  const argv = parseArgv(argvRaw)
  if (argv.color === undefined) argv.color = !argv.json && shouldColor(process.stdout, process.env)
  const emit = (r: { code: number; stdout: string; stderr: string }): number => {
    if (r.stdout) process.stdout.write(r.stdout)
    if (r.stderr) process.stderr.write(r.stderr)
    return r.code
  }
  const failure = (message: string, code = 1): number => {
    if (argv.json) {
      return emit({
        code,
        stdout: `${JSON.stringify({ ok: false, command: argv.command, projects: [], error: { message } }, null, 2)}\n`,
        stderr: '',
      })
    }
    return emit({ code, stdout: '', stderr: `${message}\n` })
  }

  if (argv.errors.length === 0 && argv.command === 'version') {
    process.stdout.write(`${LATHE_VERSION}\n`)
    return 0
  }
  // Parse errors and help need no config, and a broken config must not stop
  // someone reading `--help`.
  if (argv.errors.length > 0 || argv.command === 'help') return emit(await run(argv, undefined, realFs))
  // `diff` compares two files and generates nothing, so it needs no config.
  if (argv.command === 'diff') {
    const abs = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p))
    const result = await run(argv, undefined, {
      ...realFs,
      read: (p) => realFs.read(abs(p)),
      exists: (p) => realFs.exists(abs(p)),
      gitShow: (rev, path) => {
        // GIT_* dropped: inside a git hook they point at the HOOK's repository
        // and override `cwd`, so `git show` would read the wrong one.
        const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
        const r = spawnSync('git', ['show', `${rev}:${path}`], { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
        return r.status === 0 ? r.stdout : undefined
      },
    })
    const summaryFile = process.env.GITHUB_STEP_SUMMARY
    if (result.summary && summaryFile) appendFileSync(summaryFile, result.summary)
    return emit(result)
  }

  let loaded: LoadedConfig
  try {
    loaded = await loadConfig(cwd, argv.config)
  } catch (err) {
    return failure((err as Error).message)
  }
  if (argv.command === 'pull') return pull(argv, loaded.section, cwd, failure)

  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p))
  const scoped: Fs = {
    ...realFs,
    read: (p) => realFs.read(abs(p)),
    write: (p, c) => realFs.write(abs(p), c),
    exists: (p) => realFs.exists(abs(p)),
    mkdirp: (p) => realFs.mkdirp(abs(p)),
    remove: (p) => realFs.remove(abs(p)),
  }
  let section = loaded.section
  const once = async (): Promise<number> => emit(await run(argv, section, scoped))
  const code = await once()
  if (!argv.watch || argv.command !== 'generate' || argv.dryRun) return code

  // Watch the SPECS and the CONFIG, not the output: regenerating on our own
  // writes would loop. Editors write via rename as often as they write in
  // place, so each watcher is on the containing directory with a filename
  // filter rather than on the file itself -- a watch on the inode dies the
  // first time an editor replaces it.
  const watched = new Map<string, Set<string>>()
  const watchFile = (file: string, onChange: () => void): void => {
    const dir = dirname(file)
    let names = watched.get(dir)
    if (!names) {
      names = new Set()
      watched.set(dir, names)
      const set = names
      watch(dir, (_event, changed) => {
        if (changed === null || set.has(String(changed))) onChange()
      })
    }
    names.add(basename(file))
  }

  let queued: ReturnType<typeof setTimeout> | undefined
  let reloadConfig = false
  const rerun = (): void => {
    // Coalesce: a single save commonly produces several events (write, rename,
    // attribute change), and regenerating once per event is visible churn.
    if (queued) clearTimeout(queued)
    queued = setTimeout(() => {
      queued = undefined
      void (async () => {
        if (reloadConfig) {
          reloadConfig = false
          // An edited config is re-read, and any spec it now names starts
          // being watched. A config mid-save can be unparseable; the loop
          // reports it and keeps the previous section.
          try {
            section = (await loadConfig(cwd, loaded.file, String(Date.now()))).section
            for (const spec of specPaths(section, argv, cwd)) watchFile(spec, rerun)
          } catch (err) {
            process.stderr.write(`${(err as Error).message}\n`)
            return
          }
        }
        await once()
      })().catch((err: unknown) => {
        // A watch loop must SURVIVE a bad edit. A spec mid-save is routinely
        // unparseable, and exiting there would make the mode useless exactly
        // when it is most wanted.
        process.stderr.write(`${(err as Error).message}\n`)
      })
    }, 60)
  }

  const specs = specPaths(section, argv, cwd)
  if (specs.length === 0 && !loaded.file) return code
  for (const spec of specs) watchFile(spec, rerun)
  if (loaded.file) {
    watchFile(loaded.file, () => {
      reloadConfig = true
      rerun()
    })
  }
  process.stdout.write(
    `\nwatching ${specs.length} spec(s)${loaded.file ? ' and the config' : ''} - ctrl-c to stop\n`,
  )
  // Never resolves: the process lives until the user stops it.
  await new Promise<never>(() => {})
  return code
}

/**
 * `lathe pull [url] [dest]`.
 *
 * With a URL, pulls it to `dest`, or to the ONE configured `input`. Without a
 * URL, pulls every project that declares a `source`. It used to read only the
 * first project, and with no config at all it failed with `generate`'s "no
 * input spec" error and pointed at a `--out-spec` flag that never existed.
 */
async function pull(
  argv: Argv,
  section: LatheSection | undefined,
  cwd: string,
  failure: (message: string, code?: number) => number,
): Promise<number> {
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p))
  const headers: Record<string, string> = {}
  for (const h of argv.headers) {
    const i = h.indexOf(':')
    headers[h.slice(0, i).trim()] = h.slice(i + 1).trim()
  }
  const token = argv.token ?? process.env.LATHE_TOKEN
  if (token && !Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')) {
    headers.Authorization = `Bearer ${token}`
  }
  const cacheDir = existsSync(join(cwd, 'node_modules')) ? join(cwd, 'node_modules', '.cache', 'lathe') : undefined
  const opts = { headers, cacheDir, color: argv.color ?? false }

  const targets = pullTargets(section)
  const url = argv.input
  if (url !== undefined) {
    if (!/^https?:\/\//.test(url)) {
      return failure(
        `[Pyreon] lathe: \`lathe pull\` takes an http(s) URL; got \`${url}\`.\n` +
          '  For a spec already on disk, point `lathe.input` at it and run `lathe generate`.',
      )
    }
    if (argv.dest) return pullSpec(url, abs(argv.dest), opts)
    if (targets.length === 0) {
      return failure(
        '[Pyreon] lathe: nowhere to write the spec. Pass a destination (`lathe pull <url> ./openapi.yaml`),\n' +
          '  or set `lathe.input` in pyreon.config.ts.',
      )
    }
    if (targets.length > 1) {
      return failure(
        `[Pyreon] lathe: this config has ${targets.length} projects, so a single URL is ambiguous.\n` +
          '  Set `source` on each project and run `lathe pull`, or pass a destination: `lathe pull <url> <path>`.',
      )
    }
    return pullSpec(url, abs((targets[0] as PullTarget).input), opts)
  }
  const sourced = targets.filter((t) => t.source !== undefined)
  if (sourced.length === 0) {
    return failure(
      '[Pyreon] lathe: no URL to pull. Pass one (`lathe pull https://api.example.com/openapi.json`),\n' +
        '  or set `lathe.source` (per project, with `projects`) in pyreon.config.ts.',
    )
  }
  let code = 0
  for (const t of sourced) {
    if (t.name) process.stdout.write(`${t.name}\n`)
    code = Math.max(code, await pullSpec(t.source as string, abs(t.input), opts))
  }
  return code
}

interface PullTarget {
  name: string
  input: string
  source?: string | undefined
}

/** Every project's spec path and source, WITHOUT requiring a complete config. */
function pullTargets(section: LatheSection | undefined): PullTarget[] {
  if (!section) return []
  if (section.projects && section.projects.length > 0) {
    return section.projects.map((p) => ({ name: p.name, input: p.input, source: p.source ?? section.source }))
  }
  return section.input ? [{ name: '', input: section.input, source: section.source }] : []
}

/** Absolute paths of every spec this config reads, for the watcher. */
function specPaths(section: LatheSection | undefined, argv: Argv, cwd: string): string[] {
  const paths: string[] = []
  if (argv.input) paths.push(argv.input)
  else if (section?.projects && section.projects.length > 0) paths.push(...section.projects.map((p) => p.input))
  else if (section?.input) paths.push(section.input)
  return paths.map((p) => (isAbsolute(p) ? p : resolve(cwd, p))).filter((p) => existsSync(p))
}
