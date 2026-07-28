// Catch DUPLICATE top-level declarations across the Kotlin runtime sources.
//
// ## Why this gate exists
//
// Every native Android example adds the runtime packages as Gradle `srcDir`s:
//
//     srcDir("../../../packages/native/runtime-kotlin/src/main/kotlin")
//     srcDir("../../../packages/native/router-kotlin/src/main/kotlin")
//
// so all of those files compile as ONE module. Two files declaring the same
// top-level name in the same package is a hard `Redeclaration:` error there.
//
// The per-file gates cannot see it. `verify-kotlin.ts` compiles ONE service
// file against stubs, precisely so a module can be checked without the Android
// SDK — which means cross-file collisions are invisible to it by construction.
// `run-kotlin-tests.ts` compiles one module plus its test. So the first thing
// that notices is `gradle assembleDebug` on the device gate: an 8-minute CI
// round trip, on a workflow that does not even run for every change.
//
// That is exactly what happened when `PyreonDatabase.kt` added an
// `object PyreonJson` for its file backend, unaware that `PyreonJson.kt`
// already existed for the WebView bridge. Every local gate passed; the Android
// build failed with `Redeclaration: object PyreonJson`.
//
// ## Why a name scan rather than a whole-source-set compile
//
// Compiling the full set with kotlinc would be stricter, but needs every stub
// at once — and the stubs currently disagree (several declare their own
// `android.content.Context` with just the members their module touches, which
// is deliberate: a superset stub masks). Unifying them to satisfy a gate would
// weaken the gates that already work.
//
// A declaration-name scan catches THIS class exactly, in milliseconds, with no
// toolchain and no flakiness. It does not pretend to be a type-checker.
//
// Exit 0 when every top-level name is unique per package; exit 1 listing each
// collision with both files.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '../../../..')

/** Source roots that Gradle compiles together into one app module. */
const ROOTS = [
  'packages/native/runtime-kotlin/src/main/kotlin',
  'packages/native/router-kotlin/src/main/kotlin',
]

export interface Decl {
  name: string
  pkg: string
  file: string
  line: number
}

/**
 * Top-level declarations only — a nested `class`/`object` inside another
 * declaration is namespaced by its parent and cannot collide. Kotlin has no
 * significant indentation, so "top-level" is "the keyword starts at column 0",
 * which is how every file in these packages is written.
 *
 * Overloads are why FUNCTIONS are keyed by name + parameter list rather than
 * name alone: `fun PyreonDatabase(context: Context)` and
 * `fun PyreonDatabase(backend: Backend)` legally coexist. Types cannot
 * overload, so they key on the bare name.
 */
export function collectDeclarations(text: string, file: string): Decl[] {
  const out: Decl[] = []
  const pkgMatch = /^package\s+([\w.]+)/m.exec(text)
  const pkg = pkgMatch?.[1] ?? '<root>'
  const lines = text.split('\n')

  const TYPE_RE =
    /^(?:(?:public|internal|private|abstract|open|sealed|data|value|annotation|enum|inline|expect|actual)\s+)*(class|interface|object)\s+([A-Za-z_]\w*)/
  const FUN_RE =
    /^(?:(?:public|internal|private|inline|suspend|expect|actual|operator|infix|tailrec)\s+)*fun\s+(?:<[^>]*>\s*)?([A-Za-z_]\w*)\s*\(([^)]*)/
  const PROP_RE =
    /^(?:(?:public|internal|private|const|lateinit|expect|actual)\s+)*(?:val|var)\s+([A-Za-z_]\w*)/

  lines.forEach((line, i) => {
    // Column 0 only. Anything indented is a member.
    if (/^\s/.test(line) || line.trim().length === 0) return
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return

    const t = TYPE_RE.exec(line)
    if (t) {
      out.push({ name: t[2]!, pkg, file, line: i + 1 })
      return
    }
    const f = FUN_RE.exec(line)
    if (f) {
      // Extension functions (`fun Foo.bar()`) are captured by the receiver-less
      // regex above only when there is no dot before the name, which is what we
      // want — an extension's identity includes its receiver and collisions
      // there are a different (rarer) question.
      const params = (f[2] ?? '').replace(/\s+/g, '')
      out.push({ name: `${f[1]!}(${params})`, pkg, file, line: i + 1 })
      return
    }
    const p = PROP_RE.exec(line)
    if (p) out.push({ name: p[1]!, pkg, file, line: i + 1 })
  })

  return out
}

/** Group by `pkg::name`; anything appearing in more than one place collides. */
export function findCollisions(decls: Decl[]): Map<string, Decl[]> {
  const byKey = new Map<string, Decl[]>()
  for (const d of decls) {
    const key = `${d.pkg}::${d.name}`
    const list = byKey.get(key)
    if (list) list.push(d)
    else byKey.set(key, [d])
  }
  const collisions = new Map<string, Decl[]>()
  for (const [key, list] of byKey) {
    if (list.length > 1) collisions.set(key, list)
  }
  return collisions
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.kt')) out.push(full)
  }
  return out
}

function main(): number {
  const decls: Decl[] = []
  let scanned = 0
  for (const root of ROOTS) {
    const abs = join(REPO, root)
    try {
      statSync(abs)
    } catch {
      // A root that does not exist is a wiring bug in THIS script, not a pass.
      console.error(`[check-duplicate-declarations] missing source root: ${root}`)
      return 1
    }
    for (const file of walk(abs)) {
      scanned++
      decls.push(...collectDeclarations(readFileSync(file, 'utf8'), relative(REPO, file)))
    }
  }

  // An empty scan is a broken gate, not a clean pass.
  if (scanned === 0) {
    console.error('[check-duplicate-declarations] scanned 0 files — the gate is misconfigured')
    return 1
  }

  const collisions = findCollisions(decls)
  if (collisions.size === 0) {
    console.log(
      `[check-duplicate-declarations] ✓ ${decls.length} top-level declarations across ` +
        `${scanned} file(s), no collisions`,
    )
    return 0
  }

  console.error(
    `[check-duplicate-declarations] ✗ ${collisions.size} duplicate top-level declaration(s).\n` +
      `Every native example compiles these source roots as ONE Gradle module, so each of\n` +
      `these is a hard "Redeclaration:" error in \`gradle assembleDebug\`.\n`,
  )
  for (const [key, list] of collisions) {
    console.error(`  ${key}`)
    for (const d of list) console.error(`    ${d.file}:${d.line}`)
  }
  return 1
}

if (import.meta.main) process.exit(main())
