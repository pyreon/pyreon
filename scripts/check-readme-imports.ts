#!/usr/bin/env bun
/**
 * A README may not teach an import that does not exist.
 *
 * ## Why this is separate from `check-doc-examples`
 *
 * That gate typechecks whole code blocks, which means a block only qualifies
 * once it is SELF-CONTAINED — every identifier declared or imported. Most
 * README examples are deliberately partial (`const table = useTable(...)` with
 * `columns` assumed), so the marker is opt-in and most blocks stay unchecked.
 *
 * This asks the narrower question that needs no self-containment: does every
 * `@pyreon/*` symbol a README tells you to import actually EXIST? That is
 * checkable for all 550 blocks, not the handful that opt in, and it is the
 * decay a rename actually causes.
 *
 * Same relationship as `check-prose-props` to prose: it cannot tell you the
 * example is a good one, only that it is not teaching a symbol that is gone.
 *
 * ## What it found on the first run
 *
 * - `@pyreon/native-router-swift` and `-kotlin` both taught
 *   `import { RouterProvider, RouterView, Link, useNavigate } from '@pyreon/router'`.
 *   The export is `RouterLink`; `Link` has never existed. Both READMEs also
 *   used `createRouter` without importing it.
 * - `@pyreon/server` taught `import { pyreon } from '@pyreon/vite-plugin'`,
 *   which is a DEFAULT export. Every other README in the repo had it right.
 *
 * Neither was reachable by any existing gate: native packages are
 * manifest-exempt, and neither block was opted into `check-doc-examples`.
 *
 * ## How it decides
 *
 * By compiling, not by grepping. A probe module per package imports every
 * symbol its READMEs name, resolved through the same exports-derived path map
 * the docs gate uses, and only the errors that mean "this export is not there"
 * are reported — `TS2305` (no exported member), `TS2724` (no exported member,
 * did you mean), `TS2614` (it is a default export, not a named one).
 *
 * Everything else tsc says is ignored on purpose: the probe imports values as
 * types to keep it cheap, so `TS2749` and friends are artifacts of the probe,
 * not findings about the repo. A gate that reported those would be noise.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')
/**
 * Probes live OUTSIDE the repo.
 *
 * The first version wrote them to `node_modules/.cache/` — which the base
 * tsconfig EXCLUDES. tsc found no inputs, compiled nothing, and the gate
 * passed every time, including against the two broken imports it was written
 * to catch. It was structurally unable to fail.
 *
 * Caught by bisecting it: restoring both bugs left the gate green. The lesson
 * is not "avoid node_modules" — it is that a gate must be run against a known
 * failure before it is trusted, because a gate that checks nothing looks
 * exactly like a gate that finds nothing.
 */
const PROBE_DIR = mkdtempSync(join(tmpdir(), 'pyreon-readme-imports-'))

/** Errors that mean the export genuinely is not there. */
const REAL = /error (TS2305|TS2724|TS2614)/

/** `@pyreon/*` → source entry, including every subpath from `exports`. */
export function pyreonPaths(root: string): Record<string, string> {
  const paths: Record<string, string> = {}
  const pkgsDir = join(root, 'packages')
  if (!existsSync(pkgsDir)) return paths
  for (const cat of readdirSync(pkgsDir)) {
    const catDir = join(pkgsDir, cat)
    try {
      if (!statSync(catDir).isDirectory()) continue
    } catch {
      continue
    }
    for (const pkg of readdirSync(catDir)) {
      const dir = join(catDir, pkg)
      const pjPath = join(dir, 'package.json')
      if (!existsSync(pjPath)) continue
      let pj: { name?: string; exports?: Record<string, unknown> }
      try {
        pj = JSON.parse(readFileSync(pjPath, 'utf8'))
      } catch {
        continue
      }
      if (!pj.name?.startsWith('@pyreon/')) continue
      const idx = join(dir, 'src', 'index.ts')
      if (existsSync(idx)) paths[pj.name] = idx
      for (const key of Object.keys(pj.exports ?? {})) {
        if (!key.startsWith('./') || key === './package.json') continue
        for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
          const candidate = join(dir, 'src', `${key.slice(2)}${ext}`)
          if (existsSync(candidate)) {
            paths[`${pj.name}/${key.slice(2)}`] = candidate
            break
          }
        }
      }
    }
  }
  return paths
}

/** Symbols each README tells you to import, keyed by the package. */
export function taughtImports(readmes: readonly string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const file of readmes) {
    let src: string
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const block of src.matchAll(/^```(?:ts|tsx)\s*\n([\s\S]*?)^```/gm)) {
      for (const imp of block[1]!.matchAll(
        /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'(@pyreon\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)'/g,
      )) {
        const pkg = imp[2]!
        for (const raw of imp[1]!.split(',')) {
          const trimmed = raw.trim().replace(/^type\s+/, '')
          // `X as Y` — the IMPORTED name is what must exist.
          const name = (trimmed.split(/\s+as\s+/)[0] ?? trimmed).trim()
          if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue
          if (!out.has(pkg)) out.set(pkg, new Set())
          out.get(pkg)!.add(name)
        }
      }
    }
  }
  return out
}

/**
 * `packages/<cat>/<pkg>/README.md`, walked rather than globbed.
 *
 * A glob needs a shell; a shell needs a command string; a command string built
 * from an absolute path is what CodeQL flags (js/shell-command-injection-from-
 * environment) — correctly, because the repo path is not this script's to
 * trust. Walking removes the shell instead of arguing about the path.
 */
function findReadmes(root: string): string[] {
  const out: string[] = []
  const pkgsDir = join(root, 'packages')
  if (!existsSync(pkgsDir)) return out
  for (const cat of readdirSync(pkgsDir)) {
    const catDir = join(pkgsDir, cat)
    try {
      if (!statSync(catDir).isDirectory()) continue
    } catch {
      continue
    }
    for (const pkg of readdirSync(catDir)) {
      const readme = join(catDir, pkg, 'README.md')
      if (existsSync(readme)) out.push(readme)
    }
  }
  return out.sort()
}

function main(): number {
  const readmes = findReadmes(REPO_ROOT)

  const paths = pyreonPaths(REPO_ROOT)
  const taught = taughtImports(readmes)

  const order: string[] = []
  for (const [pkg, syms] of taught) {
    // A package with no source entry is not ours to check (a scaffolding
    // template, or a package that ships no TS surface).
    if (!paths[pkg]) continue
    order.push(pkg)
    writeFileSync(
      join(PROBE_DIR, `p${order.length}.ts`),
      `import type { ${[...syms].sort().join(', ')} } from '${pkg}'\n` +
        `export type _Probe = [${[...syms].sort().map((s) => `${s} extends never ? 1 : 0`).join(', ')}]\n`,
    )
  }

  if (order.length === 0) {
    console.log('[check-readme-imports] no @pyreon/* imports found in package READMEs.')
    return 0
  }

  const tsconfig = join(REPO_ROOT, 'tsconfig.readme-imports.json')
  writeFileSync(
    tsconfig,
    JSON.stringify({
      extends: './packages/internals/tsconfig/base.json',
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        types: [],
        // `baseUrl` is deprecated in TS6 and ERRORS without this. Left in
        // because paths still need it here — and silenced explicitly, because
        // a config error makes tsc exit before checking anything and the run
        // then reports zero findings. That false-negative is exactly how an
        // earlier version of this probe "passed".
        ignoreDeprecations: '6.0',
        baseUrl: '.',
        paths: Object.fromEntries(
          Object.entries(paths).map(([k, v]) => [k, [`./${v.replace(`${REPO_ROOT}/`, '')}`]]),
        ),
      },
      include: [`${PROBE_DIR}/*.ts`],
    }),
  )

  let output = ''
  try {
    // argv array, not a command STRING: nothing is parsed by a shell, so the
    // generated config path cannot be read as anything but one argument.
    execFileSync('bunx', ['tsc', '-p', tsconfig, '--noEmit'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (err) {
    output = String((err as { stdout?: string }).stdout ?? '')
  } finally {
    rmSync(tsconfig, { force: true })
    rmSync(PROBE_DIR, { recursive: true, force: true })
  }

  // NOTHING-WAS-CHECKED errors are failures, not passes.
  //
  // TS5xxx is a bad config; TS18003 is "no inputs were found", which is what
  // the node_modules-excluded probe directory produced — a silent, permanent
  // green. Both mean tsc never looked, and an empty findings list from a run
  // that never looked is indistinguishable from a clean one unless it is
  // called out here.
  if (/error TS(5\d{3}|18003)/.test(output)) {
    console.error('[check-readme-imports] tsc rejected the generated config — nothing was checked:\n')
    console.error(
      output.split('\n').filter((l) => /error TS(5\d{3}|18003)/.test(l)).slice(0, 5).join('\n'),
    )
    return 1
  }

  const findings = output
    .split('\n')
    .filter((line) => REAL.test(line))
    .map((line) => {
      const probe = /p(\d+)\.ts/.exec(line)
      const pkg = probe ? (order[Number(probe[1]) - 1] ?? '?') : '?'
      return `  ${pkg}: ${line.slice(line.indexOf('error ')).trim()}`
    })

  if (findings.length === 0) {
    const total = [...taught.values()].reduce((n, s) => n + s.size, 0)
    console.log(
      `✓ Every @pyreon/* symbol imported in a package README exists ` +
        `(${total} symbol(s) across ${order.length} package(s)).`,
    )
    return 0
  }

  console.error(`✗ ${findings.length} README import(s) name a symbol that does not exist:\n`)
  for (const f of findings) console.error(f)
  console.error(
    `\n  A README is the first thing a reader sees on npm and GitHub, so an\n` +
      `  import that no longer resolves teaches broken code to the audience with\n` +
      `  the least context to notice. Fix the README, or the export.\n`,
  )
  return 1
}

process.exit(main())
