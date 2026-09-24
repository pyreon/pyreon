/**
 * `lathe()` -- a Vite plugin, so a generated client is never stale in dev.
 *
 * The failure this removes is not "running a command is tedious". It is that a
 * generated client which has drifted from its spec is WORSE than an absent
 * one, because it still looks authoritative: the types compile, the calls look
 * right, and the server rejects them. Making regeneration part of starting the
 * dev server means the drift window is the time between a spec edit and the
 * next request, rather than however long it takes someone to remember.
 *
 * Deliberately NOT a transform. Generated files are written to disk and stay
 * readable, greppable and reviewable in a diff -- a virtual module would make
 * the one artifact people need to inspect the one they cannot open.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { LatheSection } from '../core/config'
import { resolveProjects } from '../core/config'
import { generate, type GenerateResult } from '../core/generate'
import { OUTPUT_MANIFEST, orphanedPaths } from '../core/output-manifest'

/** The subset of Vite's plugin surface this needs, so vite is not a dependency. */
export interface LathePluginHost {
  name: string
  apply?: 'serve' | 'build'
  configResolved?: (config: { root: string; command: string }) => void
  buildStart?: () => void | Promise<void>
  configureServer?: (server: {
    watcher: { add(path: string): void; on(event: string, cb: (path: string) => void): void }
  }) => void
}

export interface LathePluginOptions extends LatheSection {
  /**
   * Regenerate when a spec changes while the dev server runs.
   *
   * On by default: the whole point is that the window in which the client can
   * be stale is as short as possible.
   */
  watch?: boolean
  /**
   * Fail the BUILD when generated output has drifted from the spec.
   *
   * Off by default in dev (a stale file is about to be regenerated anyway) and
   * worth turning on in CI, where shipping a client that disagrees with its
   * spec is the thing to prevent.
   */
  checkOnBuild?: boolean
}

/** Result of one pass. Returned so a caller can report or assert on it. */
export interface LathePassResult {
  written: string[]
  stale: string[]
  specs: string[]
  /** Previously-generated files removed because this pass no longer emits them. */
  removed: string[]
  /** Configured specs that do not exist on disk. */
  missing: string[]
  /** Each generated project's result, for the notes/contract summary. */
  results: GenerateResult[]
}

/**
 * Run the generator once. Pure enough to test: takes its root explicitly and
 * returns what it did rather than logging.
 */
/**
 * Read a file, or `undefined` when it is not there.
 *
 * Deliberately not `existsSync` + read: that is a check-then-use pair, and when
 * the "use" is a later write it is a genuine TOCTOU race rather than just a
 * wasted syscall. One read answers both questions.
 */
function readFileOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

export function runPass(
  options: LathePluginOptions,
  root: string,
  mode: 'write' | 'check',
): LathePassResult {
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(root, p))
  const written: string[] = []
  const stale: string[] = []
  const specs: string[] = []
  const removed: string[] = []
  const missing: string[] = []
  const results: GenerateResult[] = []

  // Generate every project before writing any, as the CLI does: a refused
  // spec must leave every output tree untouched, not half of them.
  const generated: Array<{ out: string; result: ReturnType<typeof generate> }> = []
  for (const project of resolveProjects(options)) {
    const input = abs(project.input)
    specs.push(input)
    // Read directly and treat a miss as absent, rather than `existsSync` then
    // read. The exists-check is redundant — a missing file is just a read that
    // throws ENOENT, which this has to handle anyway — and pairing a filesystem
    // CHECK with a later WRITE is the TOCTOU shape CodeQL flags as
    // `js/file-system-race` (high). Same fix zero's route-types generator took;
    // see .agents/rules/anti-patterns.md, the write-if-changed guard entry.
    const source = readFileOrUndefined(input)
    if (source === undefined) {
      missing.push(input)
      continue
    }
    generated.push({ out: abs(project.output), result: generate(source, project) })
  }
  for (const { out, result } of generated) {
    const orphans = orphanedPaths(
      readFileOrUndefined(join(out, OUTPUT_MANIFEST)),
      result.files.map((f) => f.path),
    )
    for (const file of result.files) {
      const full = join(out, file.path)
      const current = readFileOrUndefined(full)
      if (current === file.contents) continue
      if (mode === 'check') {
        stale.push(full)
        continue
      }
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, file.contents, 'utf8')
      written.push(full)
    }
    // A file the previous pass generated and this one does not (a tag the
    // spec dropped). Only manifest-listed paths are candidates, so nothing
    // hand-written is ever removed.
    for (const orphan of orphans) {
      const full = join(out, orphan)
      if (readFileOrUndefined(full) === undefined) continue
      if (mode === 'check') {
        stale.push(full)
        continue
      }
      rmSync(full, { force: true })
      removed.push(full)
    }
    results.push(result)
  }
  return { written, stale, specs, removed, missing, results }
}

/**
 * The plugin.
 *
 * Generation happens in `buildStart`, before Vite resolves anything, so the
 * first module graph already sees current output. Doing it later would let the
 * first page load compile against the previous generation.
 */
export function lathe(options: LathePluginOptions): LathePluginHost {
  let root = process.cwd()
  let command = 'serve'

  return {
    name: 'pyreon:lathe',
    configResolved(config) {
      root = config.root
      command = config.command
    },
    buildStart() {
      const mode = command === 'build' && options.checkOnBuild === true ? 'check' : 'write'
      const { written, stale } = runPass(options, root, mode)
      if (stale.length > 0) {
        // A build error, not a warning. Generated output that disagrees with
        // its spec compiles and then fails against the real server.
        throw new Error(
          `[Pyreon] lathe: ${stale.length} generated file(s) are stale against the spec:\n` +
            `${stale.map((f) => `  ${f}`).join('\n')}\n` +
            'Run `lathe generate` and commit the result.',
        )
      }
      if (written.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[Pyreon] lathe: regenerated ${written.length} file(s)`)
      }
    },
    configureServer(server) {
      if (options.watch === false) return
      const { specs } = runPass(options, root, 'check')
      for (const spec of specs) server.watcher.add(spec)
      server.watcher.on('change', (path) => {
        if (!specs.includes(path)) return
        try {
          const { written } = runPass(options, root, 'write')
          // eslint-disable-next-line no-console
          console.log(`[Pyreon] lathe: ${path} changed, regenerated ${written.length} file(s)`)
        } catch (err) {
          // A spec mid-save is routinely unparseable. The dev server must
          // survive that -- exiting would make the mode useless exactly when
          // it is most wanted.
          // eslint-disable-next-line no-console
          console.error(`[Pyreon] lathe: ${(err as Error).message}`)
        }
      })
    },
  }
}

export default lathe
