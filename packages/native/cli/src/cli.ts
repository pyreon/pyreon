#!/usr/bin/env bun
// Command-line entry point for @pyreon/native-cli.
//
// Usage:
//   pyreon-native build --target=ios --source=./src --out=./generated
//   pyreon-native build --target=android --source=./src --out=./generated
//
// Exit codes:
//   0 — build succeeded
//   1 — argv / usage error
//   2 — build error (compiler threw on a source file)

import { build } from './build'
import { check, watchCheck, type CheckResult } from './check'
import { materializeAssets, type AssetTarget } from './assets'
import { stageWebBundle, webBundleOutSubdir, type WebBundleTarget } from './web-bundle'
import { startLspServer } from './lsp'
import { scanFontDir } from './fonts'
import { renderAndroidSrcDirsFile, stageIosWiring, wireApp } from './wire'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createCompiler, type CompilerPlugin, type NativeCompiler, type TargetLanguage } from '@pyreon/native-compiler'
import { pathToFileURL } from 'node:url'
import { discoverPlugins } from './discover-plugins'
import { buildPluginWebHosts, materializeBuiltWebHosts, type WebHostTarget } from './web-hosts'
import { nearestPackageDir } from './native-sources'
import { plural } from '@pyreon/ansi'
import { explainReport, pluginsReport } from './plugin-commands'
import {
  buildAllVerdict,
  buildHeader,
  buildTargetLines,
  type BuildTargetResult,
  checkHeader,
  checkReport,
  commandHeader,
  displayPath,
  emit,
  failure,
  flowContext,
  okVerdict,
  outFor,
  platformOf,
  warningLine,
  wireBroken,
  wireHeader,
  wireReport,
} from './render'
import {
  createAndroidPlatform,
  createIosPlatform,
  runDevLoop,
  sourceDirError,
  spawnRunner,
} from './dev'

interface ParsedArgs {
  command: string
  plugins?: string[]
  /** `--no-plugins`: skip package plugin discovery (explicit `--plugin` still loads). */
  noPlugins?: boolean
  /** `plugins` only: check services' types against the package's own sources. */
  verify?: boolean
  /** `explain` only: the file to explain. */
  file?: string
  compiler?: Pick<NativeCompiler, 'transform'> | undefined
  target?: TargetLanguage
  /** `assets` keeps the raw target token — it ALSO accepts `web`. */
  rawTarget?: string
  source?: string
  out?: string
  kotlinPackage?: string
  /** Dir to scan for bundled fonts (canonical→PostScript map for the Swift emit). */
  fonts?: string
  /** `check` only: also run `swiftc -typecheck` on the Swift emit. */
  typecheck?: boolean
  /** `check` only: re-run on source change (mtime poll). */
  watch?: boolean
  /** `check` only: emit machine-readable JSON instead of text. */
  json?: boolean
  /** `check` only: run as a stdio LSP server (editor diagnostics). */
  lsp?: boolean
  /** `wire` only: the app directory to resolve native sources from (default cwd). */
  app?: string
  /** `wire` only: write the Android srcDirs list to this file. */
  androidOut?: string
  iosOut?: string
  /** `assets` only: the app source dir plugin web hosts are activated from (default `<app>/src`). */
  appSource?: string
  /** `dev` only: one build-install-launch cycle, then exit. */
  once?: boolean
  /** `dev` only: simulator name/udid or adb serial. */
  device?: string
  /** `dev` only: poll interval in ms. */
  interval?: number
}

function parseArgs(argv: string[]): ParsedArgs {
  // First positional arg = command (only `build` for now). Subsequent
  // args are `--key=value` or `--key value`.
  const out: ParsedArgs = { command: argv[0] ?? '' }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
    // Boolean flags (no value, don't consume the next arg).
    if (a === '--typecheck') {
      out.typecheck = true
      continue
    }
    if (a === '--watch') {
      out.watch = true
      continue
    }
    if (a === '--lsp') {
      out.lsp = true
      continue
    }
    if (a === '--no-plugins') {
      out.noPlugins = true
      continue
    }
    if (a === '--once') {
      out.once = true
      continue
    }
    if (a === '--verify') {
      out.verify = true
      continue
    }
    if (a === '--json') {
      out.json = true
      continue
    }
    let key: string
    let value: string
    if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('=')
      key = a.slice(2, eq)
      value = a.slice(eq + 1)
    } else if (a.startsWith('--')) {
      key = a.slice(2)
      value = argv[i + 1] ?? ''
      i++
    } else {
      if (out.command === 'explain' && out.file === undefined) out.file = a
      continue
    }
    if (key === 'plugin') (out.plugins ??= []).push(value)
    else if (key === 'target') {
      out.rawTarget = value
      if (value === 'ios' || value === 'swift') out.target = 'swift'
      else if (value === 'android' || value === 'kotlin') out.target = 'kotlin'
      // Unknown targets are flagged in main() so usage prints once.
    } else if (key === 'source') out.source = value
    else if (key === 'out') out.out = value
    else if (key === 'kotlin-package') out.kotlinPackage = value
    else if (key === 'fonts') out.fonts = value
    else if (key === 'app') out.app = value
    else if (key === 'android-out') out.androidOut = value
    else if (key === 'ios-out') out.iosOut = value
    else if (key === 'app-source') out.appSource = value
    else if (key === 'device') out.device = value
    else if (key === 'interval') out.interval = Number(value)
  }
  return out
}

// `--help` is a SUCCESSFUL request for help: it belongs on stdout with exit 0.
// Every other caller here is an error path (unknown command, missing flag), so
// stderr + a non-zero exit stays the default. This matters now that the CLI is
// published: `npx pyreon-native --help` exiting 1 breaks any script or CI step
// that checks the exit code, and piping usage to stderr makes it invisible to
// a plain `| grep`.
function printUsage(stream: 'out' | 'err' = 'err'): void {
  const write = stream === 'out' ? console.log : console.error
  write(`pyreon-native — PMTC build CLI

Usage:
  pyreon-native build  --target=<ios|android|all> --source=<dir> --out=<dir>
  pyreon-native check  [--target=<ios|android>] [--typecheck] [--watch] [--json] --source=<file|dir>
  pyreon-native check  --lsp   (stdio LSP server — editor diagnostics)
  pyreon-native assets --target=<ios|android|web> --source=<dir> --out=<dir> [--app=<dir>] [--app-source=<dir>] [--no-plugins]
  pyreon-native stage-web --target=<ios|android> --source=<dir> --out=<dir>
  pyreon-native dev    --target=<ios|android> [--app=<dir>] [--source=<dir>] [--device=<name|id>] [--once]
  pyreon-native wire   [--app=<dir>] [--android-out=<file>] [--ios-out=<dir>] [--json]
  pyreon-native plugins [--app=<dir>] [--verify]
  pyreon-native explain <file.tsx> [--app=<dir>] [--no-plugins]

dev is the on-device edit loop: it watches the source, compiles it in memory
(warnings in milliseconds), and on a real change runs an incremental
xcodebuild / gradle build, installs it on the booted simulator / emulator and
relaunches the app. It skips the native build when the emitted Swift / Kotlin
is unchanged, and keeps going after a failed build. This is a rebuild loop, not
hot reload — the app restarts and in-memory state resets. --once runs a single
build-install-launch cycle and exits (use it to prepare a device for E2E).

check is the fast authoring-loop command: it runs the PMTC compiler for
both targets IN MEMORY (no build, no xcodegen/gradle, no file writes) and
reports per file — transform errors + unsupported-TS-subset warnings.
--source accepts a single .tsx (edit-loop) or a directory (walk). Add
--typecheck to ALSO run 'swiftc -typecheck' against the real SwiftUI SDK
(macOS-only; skips elsewhere), catching type-corruption that the subset
warnings + a -parse check miss. --watch re-checks on every source change
(mtime poll). --json emits machine-readable findings (editor/CI). --lsp
runs a stdio LSP server that publishes those findings as live editor
diagnostics on open/change (no --source needed — documents arrive over
JSON-RPC). Exit 0 on clean-or-warnings, 2 on errors.

assets materializes a shared assets/ directory of images
(name.png, name@2x.png, name@3x.png) into the platform's bundled
format: Assets.xcassets (ios), res/drawable-* density buckets
(android), or a plain assets/ copy for the web host's public dir. It also
builds the web-host pages that package plugins declare (the editor inside a
<WebView>), for plugins the app source imports: --app (default: the package
containing --source) and --app-source (default: <app>/src) select them.

stage-web copies a flat local web bundle (an index HTML + sibling
js/css) into the exact app location the PyreonWebView runtime resolves
a <WebView src="..."> against — ios/WebContent (bundle resources) or
android assets/ (file:///android_asset/). Flat-only: nested
subdirectories are skipped with a warning.

wire resolves the app's Pyreon native sources (base runtime/router +
co-located feature native/{swift,kotlin}/) by walking node_modules
upward — hoisting- and pnpm-symlink-safe, unlike the scaffold's fixed
../node_modules paths that dangle in a monorepo. --android-out writes
the resolved Gradle srcDirs list build.gradle.kts reads; --json prints
the full wiring (srcDirs + iOS SwiftPM packages + co-located sources).

plugins lists the service registry (each
hook and the plugin that owns it), the call recognizers, the element lowerings and every package-declared plugin
(package.json "pyreon.native.plugin"). --verify checks that each service's
Swift/Kotlin types are really declared in that package's own native sources.

explain compiles one file for both targets and prints, per service hook it
uses, the owning plugin and the declaration each target emits, per call a plugin
recognized (a code-shaped declaration), its owner and type, and, per element
a registered lowering claims, the plugin that owns that lowering.

Plugins declared by dependencies (pyreon.native.plugin) load automatically for
build/check, and only when the source imports one of the package's modules. The
dependencies are those of the app: --app, else the package containing --source.
--no-plugins turns that off; explicit --plugin files always load.

Targets:
  ios        emit Swift / SwiftUI
  android    emit Kotlin / Jetpack Compose
  all        emit BOTH — into <out>/ios + <out>/android (one command,
             every target — the "write once, ship everywhere" build)

Options:
  --plugin=<file.mjs>       Repeatable compiler plugin (build/check, including watch/LSP).
  --target=ios|android|all  Required.
  --source=<dir>            Directory of .tsx files. Required.
  --out=<dir>               Output directory for emitted .swift / .kt. Required.
                            With --target=all, the ios/ + android/ subdirs.
  --kotlin-package=<fqn> Kotlin package name prepended to emitted .kt files
                         (e.g. "com.pyreon.generated"). Required when the emit
                         is consumed by an Android host that imports it by FQN.
                         Ignored for the Swift target.

This is an experimental CLI for the Pyreon Multi-Target
Compiler (PMTC). See packages/native/cli/README.md for status.`)
}

/**
 * The app whose declared dependencies plugin discovery walks: `--app`, else the package that contains
 * the source being compiled (`--source`, or the file `explain` reads), else the working directory.
 * The package containing the source is the right default because a monorepo builds an example from
 * the repo root against `examples/<app>/src` — the root declares none of the libraries that app uses.
 */
export function resolveAppDir(parsed: Pick<ParsedArgs, 'app' | 'source' | 'file'>): string {
  if (parsed.app !== undefined) return resolve(parsed.app)
  const anchor = parsed.source ?? parsed.file
  if (anchor !== undefined) {
    const owning = nearestPackageDir(anchor)
    if (owning !== null) return owning
  }
  return resolve(process.cwd())
}

/** Loads explicit local ESM plugins once before build/check/watch/LSP.
 * @example
 * const exitCode = await mainWithPlugins([
 *   'check', '--source=./src', '--plugin=./native.mjs',
 * ])
 */
export async function mainWithPlugins(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) return main(argv)
  const parsed = parseArgs(argv)
  const appDir = resolveAppDir(parsed)
  if (parsed.command === 'plugins') {
    return printReport(await pluginsReport(appDir, parsed.verify === true))
  }
  if (parsed.command === 'explain') {
    return printReport(await runExplain(parsed, appDir))
  }
  if (parsed.command === 'assets' && !parsed.noPlugins) {
    const code = main(argv)
    return code === 0 ? runPluginWebHosts(parsed, appDir) : code
  }
  if (parsed.command === 'dev') return runDev(parsed, appDir)
  const discovering =
    ['build', 'check'].includes(parsed.command) &&
    !parsed.noPlugins &&
    parsed.source !== undefined &&
    !parsed.lsp
  if (!parsed.plugins?.length && !discovering) return main(argv)
  if (parsed.plugins?.length && !['build', 'check'].includes(parsed.command)) {
    console.error('error: --plugin is supported by build and check only')
    return 1
  }
  try {
    const plugins: CompilerPlugin[] = []
    for (const path of parsed.plugins ?? []) {
      if (!path || path.startsWith('--')) throw new Error('[Pyreon] --plugin requires a local module path')
      const module = await import(pathToFileURL(resolve(path)).href)
      plugins.push(module.default)
    }
    const discovered = discovering ? await discoverPlugins(appDir, resolve(parsed.source!)) : []
    if (plugins.length === 0 && discovered.length === 0) return main(argv)
    return main(
      argv,
      createCompiler({ plugins, discovered: discovered.map((d) => d.plugin) }),
    )
  } catch (error) {
    emit(failure(outFor(), 'plugin setup', error instanceof Error ? error.message : String(error)))
    return 2
  }
}

/**
 * The second half of `assets`: the web-host pages package plugins declare (`CompilerPlugin.webHosts`), built for the
 * plugins the app's source activates and placed where the target's runtime resolves `<WebView src>`. A failure here
 * (no bundler installed, an engine that does not resolve) fails the command — the app would otherwise build and show a
 * blank WebView, which is the worse way to find out.
 */
async function runPluginWebHosts(parsed: ParsedArgs, appDir: string): Promise<number> {
  const target = parsed.rawTarget as WebHostTarget
  const activation = resolve(parsed.appSource ?? join(appDir, 'src'))
  if (!existsSync(activation)) return 0
  const o = outFor()
  const started = performance.now()
  try {
    const files = await buildPluginWebHosts(appDir, activation)
    if (files.length === 0) return 0
    const result = materializeBuiltWebHosts(files, target, parsed.out!)
    emit([
      okVerdict(
        o,
        `built ${plural(result.hosts, 'web-host page')} from package plugins ${o.t.sym('arrow')} ${displayPath(parsed.out!, o.cwd)}`,
        performance.now() - started,
      ),
    ])
    return 0
  } catch (error) {
    emit(failure(o, 'web-host build', error instanceof Error ? error.message : String(error), performance.now() - started))
    return 2
  }
}

async function runDev(parsed: ParsedArgs, appDir: string): Promise<number> {
  const target = parsed.rawTarget
  if (target !== 'ios' && target !== 'android') {
    console.error('error: dev --target must be ios | android')
    printUsage()
    return 1
  }
  const sourceDir = resolve(parsed.source ?? join(appDir, 'src'))
  const sourceProblem = sourceDirError(sourceDir)
  if (sourceProblem) {
    console.error(`error: ${sourceProblem}`)
    return 1
  }
  const platform =
    target === 'ios'
      ? createIosPlatform(appDir, spawnRunner, parsed.device)
      : createAndroidPlatform(appDir, spawnRunner, parsed.device)
  if ('error' in platform) {
    console.error(`error: ${platform.error}`)
    return 1
  }
  try {
    const plugins: CompilerPlugin[] = []
    for (const path of parsed.plugins ?? []) {
      plugins.push((await import(pathToFileURL(resolve(path)).href)).default)
    }
    const discovered = parsed.noPlugins ? [] : await discoverPlugins(appDir, sourceDir)
    const compiler =
      plugins.length > 0 || discovered.length > 0
        ? createCompiler({ plugins, discovered: discovered.map((d) => d.plugin) })
        : undefined
    const controller = new AbortController()
    process.once('SIGINT', () => controller.abort())
    const summary = await runDevLoop({
      appDir,
      sourceDir,
      target: target === 'ios' ? 'swift' : 'kotlin',
      platform,
      run: spawnRunner,
      compiler,
      once: parsed.once === true,
      ...(parsed.interval !== undefined && Number.isFinite(parsed.interval) ? { intervalMs: parsed.interval } : {}),
      signal: controller.signal,
    })
    // --once is a gate: a failed cycle must fail the command.
    return parsed.once === true && (summary.failures > 0 || summary.builds === 0) ? 2 : 0
  } catch (error) {
    emit(failure(outFor(), 'dev', error instanceof Error ? error.message : String(error)))
    return 2
  }
}

function printReport(report: { lines: string[]; exitCode: number }): number {
  for (const line of report.lines) (report.exitCode === 0 ? console.log : console.error)(line)
  return report.exitCode
}

async function runExplain(parsed: ParsedArgs, appDir: string) {
  if (!parsed.file) {
    console.error('error: explain requires a file (pyreon-native explain <file.tsx>)')
    return { lines: [], exitCode: 1 }
  }
  const file = resolve(parsed.file)
  try {
    const discovered = parsed.noPlugins ? [] : await discoverPlugins(appDir, file)
    const plugins: CompilerPlugin[] = []
    for (const path of parsed.plugins ?? []) {
      plugins.push((await import(pathToFileURL(resolve(path)).href)).default)
    }
    const compiler = createCompiler({ plugins, discovered: discovered.map((d) => d.plugin) })
    return explainReport(readFileSync(file, 'utf8'), file, compiler)
  } catch (error) {
    return {
      lines: [`[pyreon-native] ${error instanceof Error ? error.message : String(error)}`],
      exitCode: 2,
    }
  }
}

export function main(argv: string[], compiler?: Pick<NativeCompiler, 'transform'>): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage('out')
    return 0
  }
  const parsed = parseArgs(argv)
  parsed.compiler = compiler
  if (parsed.plugins?.length && !compiler) {
    console.error('error: use mainWithPlugins() to load --plugin modules')
    return 1
  }
  if (parsed.command === 'assets') {
    return runAssets(parsed)
  }
  if (parsed.command === 'stage-web') {
    return runStageWeb(parsed)
  }
  if (parsed.command === 'check') {
    return runCheck(parsed)
  }
  if (parsed.command === 'wire') {
    return runWire(parsed)
  }
  if (parsed.command === 'plugins' || parsed.command === 'explain') {
    console.error(`error: ${parsed.command} needs plugin loading — call mainWithPlugins()`)
    return 1
  }
  if (parsed.command !== 'build') {
    printUsage()
    return 1
  }

  // `--target=all` builds BOTH native targets in one invocation, into
  // `<out>/ios` (Swift) + `<out>/android` (Kotlin) subdirectories. The
  // one-codebase story shouldn't require two separate build commands — this
  // is the single command that mirrors "write once, ship every target".
  if (parsed.rawTarget === 'all') {
    if (!parsed.source) {
      console.error('error: --source is required')
      printUsage()
      return 1
    }
    if (!parsed.out) {
      console.error('error: --out is required')
      printUsage()
      return 1
    }
    const o = outFor()
    const started = performance.now()
    emit(buildHeader(o, { platforms: 'ios + android', source: parsed.source, out: parsed.out }))
    const results: BuildTargetResult[] = []
    for (const t of ['swift', 'kotlin'] as const) {
      const outDir = join(parsed.out, platformOf(t))
      // Keep building the other target even if one fails (surface BOTH
      // sets of errors in one run); the exit code is the worst of the two.
      const result = executeBuild(parsed, t, outDir)
      results.push(result)
      emit(buildTargetLines(o, result, true))
    }
    emit(buildAllVerdict(o, results, performance.now() - started))
    return results.some((r) => r.error !== undefined) ? 2 : 0
  }

  if (!parsed.target) {
    console.error('error: --target is required (ios | android | all)')
    printUsage()
    return 1
  }
  if (!parsed.source) {
    console.error('error: --source is required')
    printUsage()
    return 1
  }
  if (!parsed.out) {
    console.error('error: --out is required')
    printUsage()
    return 1
  }

  const o = outFor()
  emit(buildHeader(o, { platforms: platformOf(parsed.target), source: parsed.source, out: parsed.out }))
  const result = executeBuild(parsed, parsed.target, parsed.out)
  emit(buildTargetLines(o, result, false))
  return result.error === undefined ? 0 : 2
}

/**
 * Transpile `parsed.source` to one native target, writing into `outDir`.
 * Extracted so the single-target path and the `--target=all` multi-target
 * loop share one build + error-handling contract. Returns what happened,
 * timed; a thrown build error is returned as `error` (exit 2).
 */
function executeBuild(parsed: ParsedArgs, target: TargetLanguage, outDir: string): BuildTargetResult {
  const started = performance.now()
  try {
    // Build the canonical→PostScript font map from --fonts (the shared
    // assets dir). Only iOS uses it (Font.custom needs the PostScript
    // name); Android resolves res/font at runtime.
    let fonts: Record<string, string> | undefined
    if (parsed.fonts && existsSync(parsed.fonts)) {
      fonts = {}
      for (const f of scanFontDir(parsed.fonts)) fonts[f.name] = f.postScriptName
    }
    const result = build({
      target,
      compiler: parsed.compiler,
      source: parsed.source!,
      out: outDir,
      ...(parsed.kotlinPackage ? { kotlinPackage: parsed.kotlinPackage } : {}),
      ...(fonts ? { fonts } : {}),
    })
    return {
      target,
      outDir,
      filesCompiled: result.filesCompiled,
      warnings: result.warnings,
      skippedWebEntries: result.skippedWebEntries,
      elapsedMs: performance.now() - started,
    }
  } catch (err) {
    return {
      target,
      outDir,
      filesCompiled: 0,
      warnings: [],
      skippedWebEntries: [],
      elapsedMs: performance.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// Only run main() if invoked directly (not when imported in tests).
// Bun sets `import.meta.main` to true for the entry script.
interface BunImportMeta {
  readonly main?: boolean
}
const meta = import.meta as ImportMeta & BunImportMeta
if (meta.main === true) {
  const argv = process.argv.slice(2)
  // `mainWithPlugins`, not `main`: package plugins (a library's own lowering, e.g. `@pyreon/charts`)
  // are discovered here, and the repo's example builds run THIS entry (`bun …/cli.ts build`), so a
  // bare `main` would silently compile every plugin-owned library as if it had no native lowering.
  void mainWithPlugins(argv).then((code) => {
    // Long-running feedback modes stay alive via their own listeners (the
    // LSP's stdin reader; `--watch`'s mtime poll). Calling process.exit
    // here would tear those down — the LSP would die before serving a
    // single request, and `--watch` would run one check then quit.
    if (!argv.includes('--lsp') && !argv.includes('--watch')) {
      process.exit(code)
    }
  })
}


function runAssets(parsed: ParsedArgs): number {
  const target = parsed.rawTarget === 'ios' ? 'ios'
    : parsed.rawTarget === 'android' ? 'android'
    : parsed.rawTarget === 'web' ? 'web'
    : undefined
  if (!target) {
    console.error('error: assets --target must be ios | android | web')
    printUsage()
    return 1
  }
  if (!parsed.source || !parsed.out) {
    console.error('error: assets requires --source and --out')
    printUsage()
    return 1
  }
  const o = outFor()
  const started = performance.now()
  emit(commandHeader(o, 'assets', flowContext(o, target, parsed.source, parsed.out)))
  try {
    const result = materializeAssets(parsed.source, target as AssetTarget, parsed.out)
    emit([
      okVerdict(
        o,
        `materialized ${plural(result.assets, 'asset')} (${plural(result.files, 'file')}) ${o.t.sym('arrow')} ${displayPath(parsed.out, o.cwd)}`,
        performance.now() - started,
      ),
    ])
    return 0
  } catch (err) {
    emit(failure(o, 'assets', err instanceof Error ? err.message : String(err), performance.now() - started))
    return 2
  }
}

/**
 * `stage-web` — copy a flat local web bundle into the app location the
 * PyreonWebView runtime resolves `<WebView src="…">` against. Only the
 * two NATIVE targets (`ios` | `android`) apply — the web host serves its
 * own files directly, so there is nothing to stage there.
 */
function runStageWeb(parsed: ParsedArgs): number {
  const target: WebBundleTarget | undefined =
    parsed.rawTarget === 'ios' ? 'ios' : parsed.rawTarget === 'android' ? 'android' : undefined
  if (!target) {
    console.error('error: stage-web --target must be ios | android')
    printUsage()
    return 1
  }
  if (!parsed.source || !parsed.out) {
    console.error('error: stage-web requires --source and --out')
    printUsage()
    return 1
  }
  const o = outFor()
  const started = performance.now()
  emit(commandHeader(o, 'stage-web', flowContext(o, target, parsed.source, parsed.out)))
  try {
    const result = stageWebBundle(parsed.source, target, parsed.out)
    for (const dir of result.skippedDirs) {
      emit(
        warningLine(
          o,
          `skipped nested directory '${dir}' (flat-only v1 — the runtime resolves 'src' by bare name; nested support is a follow-up)`,
        ),
      )
    }
    if (result.skippedDirs.length > 0) emit([{ to: 'log', text: '' }])
    emit([
      okVerdict(
        o,
        `staged ${plural(result.files, 'web-bundle file')} ${o.t.sym('arrow')} ${displayPath(join(parsed.out, webBundleOutSubdir(target)), o.cwd)}`,
        performance.now() - started,
        result.skippedDirs.length > 0 ? [plural(result.skippedDirs.length, 'warning')] : [],
      ),
    ])
    return 0
  } catch (err) {
    emit(failure(o, 'stage-web', err instanceof Error ? err.message : String(err), performance.now() - started))
    return 2
  }
}

/**
 * `wire` — resolve the app's Pyreon native sources (hoisting/pnpm-safe) and
 * emit the concrete build wiring. The Gap-1 fix: replaces the scaffold's
 * FIXED `../node_modules/@pyreon/native-runtime-*` paths with paths RESOLVED
 * at build time, so a monorepo (hoisting / pnpm symlinks) builds where the
 * fixed path dangles.
 *
 *   --app=<dir>            App dir to resolve from (default cwd).
 *   --android-out=<file>   Write the Gradle srcDirs list to this file.
 *   --ios-out=<dir>        The Xcode project dir. Stages co-located Swift into
 *                          <dir>/PyreonNative and links the SwiftPM runtimes
 *                          into <dir>/PyreonPackages, both of which the spec
 *                          references by a constant path.
 *   --json                 Print the full wiring as JSON (machine/CI).
 *
 * A DECLARED-but-missing native dir is a real misconfiguration → exit 2.
 */
function runWire(parsed: ParsedArgs): number {
  const started = performance.now()
  const appDir = resolve(parsed.app ?? process.cwd())
  if (!existsSync(join(appDir, 'package.json'))) {
    console.error(`error: no package.json in ${appDir} (pass --app=<dir>)`)
    return 1
  }
  const o = outFor()
  if (!parsed.json) emit(wireHeader(o, appDir))
  const wiring = wireApp(appDir)

  let androidOut: string | undefined
  if (parsed.androidOut) {
    androidOut = resolve(appDir, parsed.androidOut)
    mkdirSync(dirname(androidOut), { recursive: true })
    writeFileSync(androidOut, renderAndroidSrcDirsFile(wiring))
  }

  let ios: { dir: string; staged: number; linked: number } | undefined
  if (parsed.iosOut) {
    const dir = resolve(appDir, parsed.iosOut)
    ios = { dir, ...stageIosWiring(wiring, dir) }
  }

  if (parsed.json) {
    console.log(JSON.stringify(wiring, null, 2))
    // The machine surface is stdout; a broken declaration still reaches a person on stderr.
    emit(wireBroken(o, wiring))
  } else {
    emit(
      wireReport(o, {
        appDir,
        ...wiring,
        androidOut,
        ios,
        list: !parsed.androidOut && !parsed.iosOut,
        elapsedMs: performance.now() - started,
      }),
    )
  }
  return wiring.brokenDeclarations.length > 0 ? 2 : 0
}

/** Render a check result — JSON (machine, byte-locked) or text (human). */
function reportCheck(
  result: CheckResult,
  targets: TargetLanguage[],
  parsed: ParsedArgs,
  elapsedMs: number,
): void {
  if (parsed.json) {
    console.log(
      JSON.stringify({
        filesChecked: result.filesChecked,
        targets,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        findings: result.findings,
        skippedWebEntries: result.skippedWebEntries,
      }),
    )
    return
  }
  emit(
    checkReport(outFor(), result, {
      source: parsed.source!,
      targets,
      typecheck: parsed.typecheck,
      watching: parsed.watch,
      elapsedMs,
    }),
  )
}

function runCheck(parsed: ParsedArgs): number {
  if (parsed.rawTarget !== undefined && !parsed.target && parsed.rawTarget !== 'all') {
    console.error(`[Pyreon] Unknown check target "${parsed.rawTarget}". Choose ios, android, swift, kotlin, or all.`)
    return 1
  }
  // `--lsp` runs a stdio LSP server (editor diagnostics). It reads
  // documents over JSON-RPC, not from `--source`, so it's handled before
  // the source check. The server stays alive on stdin (see the bin entry,
  // which skips process.exit for long-running modes).
  if (parsed.lsp) {
    startLspServer(parsed.compiler)
    return 0
  }
  if (!parsed.source) {
    console.error('error: check requires --source (a .tsx file or a directory)')
    printUsage()
    return 1
  }
  // `--target` narrows to one platform; default checks BOTH (the DX
  // default — you want to know if your component works everywhere).
  const targets: TargetLanguage[] = parsed.target ? [parsed.target] : ['swift', 'kotlin']
  const checkOpts = {
    source: parsed.source,
    compiler: parsed.compiler,
    targets,
    ...(parsed.typecheck ? { typecheck: true } : {}),
  }
  try {
    if (!parsed.json) {
      emit(checkHeader(outFor(), { source: parsed.source, targets, typecheck: parsed.typecheck, watching: parsed.watch }))
    }
    if (parsed.watch) {
      // Long-running: re-check on every source change until Ctrl-C.
      // Returns 0 — the watcher's job is feedback, not a pass/fail gate.
      void watchCheck(checkOpts, { onResult: (r, ms) => reportCheck(r, targets, parsed, ms) })
      return 0
    }
    const started = performance.now()
    const result = check(checkOpts)
    reportCheck(result, targets, parsed, performance.now() - started)
    return result.errorCount > 0 ? 2 : 0
  } catch (err) {
    emit(failure(outFor(), 'check', err instanceof Error ? err.message : String(err)))
    return 2
  }
}
