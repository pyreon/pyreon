/**
 * Every canonical primitive must be used by at least one NATIVE example.
 *
 * A primitive no example uses is a primitive the device gates never compile,
 * and the device gates are the only configuration with no stubs in them. That
 * is not a hypothetical: `<Audio>` was the single primitive no native example
 * used, and it turned out to be the single primitive that had never compiled on
 * either platform — Android had no composable at all, and both engines its emit
 * names existed only in the validation stubs. Every gate was green for the
 * primitive's whole life because none of them had occasion to build it.
 *
 * So the coverage question gets asked directly, rather than being a property
 * nobody was tracking. The canonical list is read from the compiler's own map,
 * not restated here — a hardcoded list is what lets an entry fall out silently.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..')

/**
 * The primitives, from `@pyreon/primitives`' own component exports.
 *
 * NOT from the compiler's `SWIFT_NAMES` map, which was the first thing tried
 * and is the wrong source: it holds 16 entries and omits `Audio`, `Transition`
 * and `WebView`, because those have dedicated emitters rather than a name
 * mapping. Keying on it made this gate report "all 16 covered" while `<Audio>`
 * — the primitive that motivated the gate — was not in the set being checked.
 *
 * The package's export list is the honest source: if it ships as a component,
 * an example must build it.
 */
function canonicalPrimitives(): string[] {
  const src = readFileSync(join(REPO, 'packages/core/primitives/src/index.ts'), 'utf8')
  const names = [...src.matchAll(/^export \{ ([A-Z][A-Za-z0-9]*) \} from '\.\/web\//gm)].map(
    (m) => m[1]!,
  )
  return [...new Set(names)].sort()
}

/** Every `.tsx` under a `native-*` example's `src/`. */
function nativeExampleSources(): string[] {
  const examples = join(REPO, 'examples')
  const out: string[] = []
  for (const dir of readdirSync(examples)) {
    if (!dir.startsWith('native-')) continue
    const srcDir = join(examples, dir, 'src')
    let entries: string[]
    try {
      entries = readdirSync(srcDir)
    } catch {
      continue
    }
    for (const f of entries) {
      const p = join(srcDir, f)
      if (statSync(p).isFile() && f.endsWith('.tsx')) out.push(p)
    }
  }
  return out
}

const primitives = canonicalPrimitives()
const sources = nativeExampleSources()

if (primitives.length < 10) {
  console.error(
    `[check-native-primitive-coverage] ✗ only ${primitives.length} primitive(s) parsed — the map's shape changed and this gate is no longer measuring anything.`,
  )
  process.exit(1)
}
if (sources.length === 0) {
  // An empty scan is a SKIP-shaped false pass, which is the thing this gate is
  // about. Fail loudly instead.
  console.error('[check-native-primitive-coverage] ✗ found no native example sources to scan.')
  process.exit(1)
}

/**
 * Comments stripped BEFORE matching. The first version of this gate did not,
 * and passed because a JSX comment in the example said the words
 * "`<Audio>` was the ONE canonical primitive no native example used" — prose
 * about a primitive satisfying a check about compiling it. A gate that text can
 * talk its way past is not measuring anything.
 */
const stripComments = (src: string): string =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ') // {/* jsx comment */}
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* block */
    .replace(/^[ \t]*\/\/.*$/gm, ' ') // // line

const corpus = sources.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n')
const unused = primitives.filter((p) => !new RegExp(`<${p}[\\s/>]`).test(corpus))

if (unused.length > 0) {
  console.error(
    `[check-native-primitive-coverage] ✗ ${unused.length} primitive(s) are used by NO native example, so no device gate ever compiles them:\n` +
      unused.map((p) => `  <${p}>`).join('\n') +
      `\n\nAdd each to a gated example (see the <Audio> row in examples/native-router-demo-ios/src/RouterApp.tsx).` +
      `\nA primitive nothing builds is where <Audio> hid an emit that referenced types no runtime defined.`,
  )
  process.exit(1)
}

console.log(
  `[check-native-primitive-coverage] ✓ all ${primitives.length} canonical primitive(s) are built by a native example (${sources.length} source file(s) scanned)`,
)
