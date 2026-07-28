// Scaffold a multiplatform app the way a real user does, then prove the
// template it produced actually COMPILES for both native targets.
//
// ## Why this exists
//
// `create-multiplatform` is the entry point for every new native Pyreon app —
// it is what `pyreon new --native` runs. It had NO end-to-end coverage.
//
// Its unit tests (44) assert the file list and name parameterization: that a
// `README.md` is emitted, that the project name reaches the Swift `@main`
// struct and the Gradle config. None of them compile the `src/App.tsx` the
// scaffold ships. The repo's `Scaffold Smoke` matrix covers only the
// `create-zero` web cells (`cpa-smoke-*`); nothing references
// `create-multiplatform` in any workflow.
//
// So the template source could drift out of the compiler's supported subset —
// a renamed primitive, a prop the emit stopped handling, a hook whose lowering
// changed — and every gate would stay green while `npx create-multiplatform`
// produced an app that does not build. That is the repo's own "test the
// shipped ENTRY, not the export" rule, applied to the first thing a new user
// touches.
//
// ## What it does, and what it deliberately does not
//
//   scaffold  →  emit iOS + Android via @pyreon/native-cli  →  typecheck both
//
// It does NOT run `xcodebuild` or `gradle assembleDebug`. Those need an Xcode
// or Android SDK runner and minutes of wall clock; this runs in seconds on the
// ubuntu box that already has `swiftc` + `kotlinc` for the emit-validation job
// it lives beside. The full device build of REAL apps is what `native-device`
// covers — this gate answers the narrower question nothing else asks: does the
// SCAFFOLD's own template still compile?
//
// One wrinkle worth stating, because it caused a false failure while writing
// this: the CLI adds real `androidx.*` / `com.pyreon.*` imports to its Kotlin
// output, while `validateKotlin` concatenates minimal stubs into the SAME
// file. Those imports are then unresolvable and the check fails for a reason
// that has nothing to do with the emit. Swift's validator already strips
// imports for exactly this reason; the Kotlin path needs the same treatment
// here.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCAFFOLDER = join(REPO, 'packages/zero/create-multiplatform/src/index.ts')
const CLI = join(REPO, 'packages/native/cli/src/cli.ts')

const APP_NAME = 'smokeapp'

interface Step {
  readonly name: string
  readonly ok: boolean
  readonly detail?: string
}

const steps: Step[] = []
const record = (name: string, ok: boolean, detail?: string): boolean => {
  steps.push(detail === undefined ? { name, ok } : { name, ok, detail })
  return ok
}

/** Strip `package` / `import` lines — the emit-validators concatenate stubs
 * into the same compilation unit, so real imports cannot resolve. */
function stripModuleHeader(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(package|import)\s/.test(l))
    .join('\n')
}

async function main(): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-native-scaffold-'))
  const app = join(dir, APP_NAME)
  try {
    // 1. Scaffold, through the scaffolder's own entry function — the same one
    //    the published `bin/create-multiplatform.js` calls.
    const mod = (await import(SCAFFOLDER)) as { main(argv: string[]): Promise<void> }
    await mod.main([APP_NAME, '--dir', app])
    const appSrc = join(app, 'src/App.tsx')
    if (!record('scaffold', existsSync(appSrc), existsSync(appSrc) ? undefined : `missing ${appSrc}`)) {
      return report(1)
    }

    // 2. Emit both native targets from the scaffolded source.
    const iosOut = join(app, 'ios/generated')
    const androidOut = join(app, 'android/generated')
    for (const [target, out] of [
      ['ios', iosOut],
      ['android', androidOut],
    ] as const) {
      const r = spawnSync(
        'bun',
        [CLI, 'build', `--target=${target}`, `--source=${join(app, 'src')}`, `--out=${out}`],
        { encoding: 'utf8' },
      )
      const ok = r.status === 0
      if (!record(`emit ${target}`, ok, ok ? undefined : (r.stderr || r.stdout || '').trim().slice(0, 800))) {
        return report(1)
      }
    }

    // 3. Type-check what came out. An emit that produces uncompilable native
    //    code is the failure mode this whole gate exists for, and it is
    //    invisible to the scaffolder's own unit tests.
    const validate = (await import(
      join(REPO, 'packages/native/compiler/src/validate.ts')
    )) as {
      isSwiftcAvailable(): boolean
      isKotlincAvailable(): boolean
      validateSwiftWithStubs(code: string): { ok: boolean; error?: string }
      validateKotlin(code: string): { ok: boolean; error?: string }
    }

    const swiftFile = join(iosOut, 'App.swift')
    const kotlinFile = join(androidOut, 'App.kt')
    if (!record('emit produced App.swift', existsSync(swiftFile))) return report(1)
    if (!record('emit produced App.kt', existsSync(kotlinFile))) return report(1)

    // A missing toolchain is a SKIP, never a silent pass — the summary says
    // which checks actually ran.
    if (validate.isSwiftcAvailable()) {
      const r = validate.validateSwiftWithStubs(readFileSync(swiftFile, 'utf8'))
      record('swift typecheck', r.ok, r.ok ? undefined : (r.error ?? '').split('\n').slice(0, 12).join('\n'))
    } else {
      record('swift typecheck', true, 'SKIPPED — swiftc not on PATH')
    }

    if (validate.isKotlincAvailable()) {
      const r = validate.validateKotlin(stripModuleHeader(readFileSync(kotlinFile, 'utf8')))
      record('kotlin typecheck', r.ok, r.ok ? undefined : (r.error ?? '').split('\n').slice(0, 12).join('\n'))
    } else {
      record('kotlin typecheck', true, 'SKIPPED — kotlinc not on PATH')
    }

    return report(steps.every((s) => s.ok) ? 0 : 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function report(code: number): number {
  const label = '[scaffold-native-smoke]'
  for (const s of steps) {
    const mark = s.ok ? '✓' : '✗'
    const suffix = s.detail === undefined ? '' : ` — ${s.detail}`
    console.log(`${label} ${mark} ${s.name}${suffix}`)
  }
  console.log(
    code === 0
      ? `${label} scaffolded app compiles for both native targets`
      : `${label} FAILED — \`npx create-multiplatform\` would produce an app that does not build`,
  )
  return code
}

process.exit(await main())
