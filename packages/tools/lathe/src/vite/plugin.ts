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

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { LatheSection } from '../core/config'
import { resolveProjects } from '../core/config'
import { generate, type GenerateResult } from '../core/generate'
import { noteSeverity } from '../core/ir'
import { OUTPUT_MANIFEST, orphanedPaths } from '../core/output-manifest'
import { diffCommittedSurface, type SurfaceChange } from '../core/surface'
import { loadConfig } from '../cli/config-file'
import { closest } from '../core/suggest'
import type { ReadOutcome } from '../input/bundle'
import { fetchRemoteParts } from '../cli/remote-refs'

/** The subset of Vite's plugin surface this needs, so vite is not a dependency. */
export interface LathePluginHost {
  name: string
  apply?: 'serve' | 'build'
  configResolved?: (config: { root: string; command: string }) => void | Promise<void>
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
  /** Each generated project's result and contract changes, for the summary. */
  projects: Array<{ result: GenerateResult; changes: SurfaceChange[] }>
  /**
   * Every OTHER document a spec `$ref`s, mapped to that spec: an edit to a
   * split spec's part regenerates the project that owns it.
   */
  documents: Map<string, string>
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
  only?: string,
  /** Remote parts fetched for `remoteRefs: 'fetch'`, by absolute spec path. */
  remote?: ReadonlyMap<string, ReadonlyMap<string, ReadOutcome>>,
): LathePassResult {
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(root, p))
  const written: string[] = []
  const stale: string[] = []
  const specs: string[] = []
  const removed: string[] = []
  const missing: string[] = []
  const projects: Array<{ result: GenerateResult; changes: SurfaceChange[] }> = []
  const documents = new Map<string, string>()

  // Generate every project before writing any, as the CLI does: a refused
  // spec must leave every output tree untouched, not half of them.
  const generated: Array<{ out: string; result: ReturnType<typeof generate> }> = []
  for (const project of resolveProjects(options)) {
    const input = abs(project.input)
    // `only`: a spec path. A change to one project's spec regenerates THAT
    // project, not every project the config declares.
    if (only !== undefined && input !== only) continue
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
    // `location` + `readDocument` resolve a `$ref` into another file against
    // the spec's own path and bundle it (see `input/bundle.ts`).
    const result = generate(source, project, {
      location: input,
      readDocument: (id) => readFileSync(id, 'utf8'),
      remoteDocuments: remote?.get(input),
    })
    for (const d of result.documents)
      if (d !== input && !/^https?:\/\//i.test(d)) documents.set(d, input)
    generated.push({ out: abs(project.output), result })
  }
  for (const { out, result } of generated) {
    // Read before the writes below replace it: afterwards only the new
    // surface exists, and the diff is what makes a contract change visible.
    const changes = diffCommittedSurface(
      readFileOrUndefined(join(out, 'api-surface.json')),
      result.surface,
    )
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
    projects.push({ result, changes })
  }
  return { written, stale, specs, removed, missing, projects, documents }
}

/** Absolute spec paths a set of options reads, WITHOUT generating anything. */
export function specPathsOf(options: LathePluginOptions, root: string): string[] {
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(root, p))
  try {
    return resolveProjects(options).map((p) => abs(p.input))
  } catch {
    return []
  }
}

/**
 * `[Pyreon] lathe: spec not found at x` plus the file that was probably meant.
 *
 * A typo'd `input` used to boot the dev server with NO client and no message:
 * `runPass` skipped a missing spec silently, which is right for a spec that is
 * not there YET and wrong for one whose name is misspelled.
 */
export function missingSpecMessage(path: string): string {
  let hint = ''
  try {
    const dir = dirname(path)
    const candidates = readdirSync(dir).filter((f) => /\.(ya?ml|json)$/i.test(f))
    const best = closest(basename(path), candidates)
    if (best) hint = ` Did you mean \`${join(dir, best)}\`?`
  } catch {
    // The directory itself is missing; there is nothing to suggest.
  }
  return `[Pyreon] lathe: spec not found at ${path} -- no client was generated.${hint}`
}

/** One line per generated project: what changed, what was lost, what broke. */
export function passSummary(pass: LathePassResult): string[] {
  const lines: string[] = []
  const moved = pass.written.length + pass.removed.length
  for (const { result, changes } of pass.projects) {
    const losses = result.doc.notes.filter((n) => noteSeverity(n) === 'loss').length
    const breaking = changes.filter((c) => c.severity === 'breaking')
    const parts = [`${result.doc.title} ${result.doc.version}`]
    if (breaking.length > 0) {
      parts.push(
        `${breaking.length} BREAKING contract change(s): ${breaking
          .slice(0, 3)
          .map((c) => c.subject)
          .join(', ')}${breaking.length > 3 ? ', ...' : ''}`,
      )
    }
    if (losses > 0) parts.push(`${losses} spec feature(s) not represented`)
    if (moved > 0 || breaking.length > 0) lines.push(`[Pyreon] lathe: ${parts.join(' -- ')}`)
  }
  if (moved > 0) {
    lines.push(
      `[Pyreon] lathe: regenerated ${pass.written.length} file(s)` +
        (pass.removed.length > 0 ? `, removed ${pass.removed.length}` : '') +
        (pass.projects.some((p) => p.result.doc.notes.length > 0)
          ? ' -- run `lathe generate` for the full report'
          : ''),
    )
  }
  return lines
}

/**
 * The plugin.
 *
 * Reads the `lathe` section of `pyreon.config.*` (found upward from Vite's
 * root, paths relative to that file); options passed here win per key, so
 * `lathe({ checkOnBuild: true })` is the whole call for a configured project.
 *
 * Generation happens ONCE, in `buildStart`, before Vite resolves anything, so
 * the first module graph already sees current output. `configureServer` runs
 * before it in dev and only registers the watch -- it used to run a full
 * generation of its own just to learn the spec paths.
 */
export function lathe(options: LathePluginOptions = {}): LathePluginHost {
  let root = process.cwd()
  let command = 'serve'
  let configFile: string | undefined
  let effective: LathePluginOptions = options

  const merge = (section: LatheSection | undefined): LathePluginOptions => ({
    ...section,
    ...options,
  })
  const log = (lines: readonly string[]): void => {
    // eslint-disable-next-line no-console
    for (const l of lines) console.log(l)
  }
  const warnMissing = (pass: LathePassResult): void => {
    // eslint-disable-next-line no-console
    for (const m of pass.missing) console.warn(missingSpecMessage(m))
  }

  // `remoteRefs: 'fetch'`: remote parts are downloaded once per build start
  // (and on a config edit) -- a local edit regenerates from them without
  // re-fetching.
  const remote = new Map<string, ReadonlyMap<string, ReadOutcome>>()
  const fetchRemote = async (): Promise<void> => {
    remote.clear()
    const cacheDir = join(root, 'node_modules', '.cache', 'lathe')
    for (const project of resolveProjects(effective)) {
      if (project.remoteRefs !== 'fetch') continue
      const input = isAbsolute(project.input) ? project.input : resolve(root, project.input)
      const source = readFileOrUndefined(input)
      if (source === undefined) continue
      remote.set(
        input,
        await fetchRemoteParts(
          source,
          input,
          (id) => readFileSync(id, 'utf8'),
          project.remoteHeaders,
          cacheDir,
        ),
      )
    }
  }

  // Referenced documents (a split spec's parts) -> the spec that owns them.
  // Filled by every pass; watched once the dev server exists.
  const owners = new Map<string, string>()
  let watcher: { add(path: string): unknown } | undefined
  const track = (pass: LathePassResult): void => {
    for (const [doc, spec] of pass.documents) {
      if (!owners.has(doc)) watcher?.add(doc)
      owners.set(doc, spec)
    }
  }

  return {
    name: 'pyreon:lathe',
    async configResolved(config) {
      root = config.root
      command = config.command
      const loaded = await loadConfig(root)
      configFile = loaded.file
      effective = merge(loaded.section)
    },
    buildStart() {
      const generateNow = (): void => {
        const mode = command === 'build' && effective.checkOnBuild === true ? 'check' : 'write'
        const pass = runPass(effective, root, mode, undefined, remote)
        track(pass)
        if (pass.stale.length > 0) {
          // A build error, not a warning. Generated output that disagrees with
          // its spec compiles and then fails against the real server.
          throw new Error(
            `[Pyreon] lathe: ${pass.stale.length} generated file(s) are stale against the spec:\n` +
              `${pass.stale.map((f) => `  ${f}`).join('\n')}\n` +
              'Run `lathe generate` and commit the result.',
          )
        }
        warnMissing(pass)
        log(passSummary(pass))
      }
      // Synchronous unless a project fetches remote parts: the generation must
      // have run before Vite resolves anything, and an async hook for the
      // common offline case would only add a tick.
      if (!resolveProjects(effective).some((p) => p.remoteRefs === 'fetch')) return generateNow()
      return fetchRemote().then(generateNow)
    },
    configureServer(server) {
      if (effective.watch === false) return
      let specs = specPathsOf(effective, root)
      for (const spec of specs) server.watcher.add(spec)
      if (configFile) server.watcher.add(configFile)
      watcher = server.watcher
      for (const doc of owners.keys()) server.watcher.add(doc)
      server.watcher.on('change', (changed) => {
        const isConfig = changed === configFile
        // A referenced document stands in for the spec that owns it.
        const path = owners.get(changed) ?? changed
        if (!isConfig && !specs.includes(path)) return
        void (async () => {
          if (isConfig && configFile) {
            // An edited config is re-read (cache-busted) and any spec it now
            // names starts being watched.
            effective = merge((await loadConfig(root, configFile, String(Date.now()))).section)
            specs = specPathsOf(effective, root)
            for (const spec of specs) server.watcher.add(spec)
          }
          // A spec change regenerates the project that owns it; a config
          // change can move every project, so it regenerates all of them.
          if (isConfig) await fetchRemote()
          const pass = runPass(effective, root, 'write', isConfig ? undefined : path, remote)
          track(pass)
          warnMissing(pass)
          log(passSummary(pass))
        })().catch((err: unknown) => {
          // A spec (or config) mid-save is routinely unparseable. The dev
          // server must survive that -- exiting would make the mode useless
          // exactly when it is most wanted.
          // eslint-disable-next-line no-console
          console.error(`[Pyreon] lathe: ${(err as Error).message}`)
        })
      })
    },
  }
}

export default lathe
