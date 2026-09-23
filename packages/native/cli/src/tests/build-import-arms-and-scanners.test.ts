/**
 * The content-keyed Kotlin import arms nothing had exercised, and the
 * directory scanners' skip paths.
 *
 * Every arm in `conditionalKotlinImports` exists because of the same trap:
 * the kotlinc validate gate concatenates its stubs into one compilation unit,
 * so a symbol resolves there WITH OR WITHOUT an import, and only the real
 * `gradle assembleDebug` — one CI round later — notices the missing line. An
 * arm with no spec is one whose predicate can drift (the `.clickable(` vs
 * `.clickable {` shape that cost a device build) without anything failing
 * before the device does. Each arm below asserts the import is present for
 * the shape the emitter produces AND absent for a plain emit, because a
 * predicate that always fires is as wrong as one that never does — it pulls
 * an unused import into every file and kotlinc warns on all of them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build, conditionalKotlinImports, findTsxFiles } from '../build'
import { parseAssetFilename, scanAssetDir } from '../assets'
import { parseFontFilename, sanitizeFontResourceName, scanFontDir } from '../fonts'
import { scanWebHostDir } from '../web-assets'
import { resolveNativeSources } from '../native-sources'
import { computeWiring } from '../wire'
import { writeFixtureFont } from './font-fixture'

const PLAIN = 'Text(text = "hi")'

describe('conditionalKotlinImports — one arm per sub-package symbol', () => {
  const cases: Array<[string, string, string]> = [
    ['onPreviewKeyEvent (trailing lambda)', 'Modifier.onPreviewKeyEvent { false }', 'androidx.compose.ui.input.key.*'],
    ['focusRequester modifier', 'Modifier.focusRequester(fr)', 'androidx.compose.ui.focus.focusRequester'],
    ['FocusRequester constructor', 'val fr = remember { FocusRequester() }', 'androidx.compose.ui.focus.FocusRequester'],
    ['focusable', 'Modifier.focusable()', 'androidx.compose.foundation.focusable'],
    ['coroutine launch', 'pyreonAsyncScope.launch { go() }', 'kotlinx.coroutines.launch'],
    ['encodeToString extension', 'Json.encodeToString(payload)', 'kotlinx.serialization.encodeToString'],
    ['border modifier', 'Modifier.border(BorderStroke(1.dp, c))', 'androidx.compose.foundation.border'],
    ['BorderStroke', 'Modifier.border(BorderStroke(1.dp, c))', 'androidx.compose.foundation.BorderStroke'],
    ['semantics role', 'Modifier.semantics { role = Role.Button }', 'androidx.compose.ui.semantics.Role'],
    ['role property', 'Modifier.semantics { role = Role.Button }', 'androidx.compose.ui.semantics.role'],
    ['heading', 'Modifier.semantics { heading() }', 'androidx.compose.ui.semantics.heading'],
    ['clearAndSetSemantics', 'Modifier.clearAndSetSemantics { }', 'androidx.compose.ui.semantics.clearAndSetSemantics'],
    ['LocalDensity', 'val d = LocalDensity.current', 'androidx.compose.ui.platform.LocalDensity'],
    ['LocalHapticFeedback', 'val h = LocalHapticFeedback.current', 'androidx.compose.ui.platform.LocalHapticFeedback'],
    ['LocalConfiguration', 'LocalConfiguration.current.screenWidthDp', 'androidx.compose.ui.platform.LocalConfiguration'],
    ['FontStyle', 'fontStyle = FontStyle.Italic', 'androidx.compose.ui.text.font.FontStyle'],
    ['TextAlign', 'textAlign = TextAlign.Center', 'androidx.compose.ui.text.style.TextAlign'],
  ]
  for (const [name, emitted, imp] of cases) {
    it(`${name} → import ${imp}`, () => {
      expect(conditionalKotlinImports(emitted)).toContain(`import ${imp}`)
      expect(conditionalKotlinImports(PLAIN), 'absent for a plain emit').not.toContain(`import ${imp}`)
    })
  }

  it('the trailing-lambda AND paren forms both key the focus/key arms', () => {
    // The `.clickable(` vs `.clickable {` trap, applied to the arms that
    // accept a lambda: keying on one call shape misses every real emit of
    // the other.
    expect(conditionalKotlinImports('Modifier.onPreviewKeyEvent(handler)')).toContain('input.key.*')
    expect(conditionalKotlinImports('Modifier.focusable { }')).toContain('foundation.focusable')
  })
})

describe('findTsxFiles', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-cli-find-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('skips `.test.tsx` beside the sources it would otherwise compile', () => {
    // A test file lowered to Swift is a build failure at best (vitest
    // imports) and a shipped test at worst.
    writeFileSync(join(dir, 'A.tsx'), 'export function A() { return <Text>a</Text> }')
    writeFileSync(join(dir, 'A.test.tsx'), 'import { it } from "vitest"')
    writeFileSync(join(dir, 'notes.md'), '# not a source')
    expect(findTsxFiles(dir).map((f) => f.split('/').pop())).toEqual(['A.tsx'])
  })

  it('threads `fonts` into the transform', () => {
    writeFileSync(
      join(dir, 'A.tsx'),
      'export function A() { return <Text style={{ fontFamily: "Inter-Bold" }}>a</Text> }',
    )
    const out = join(dir, 'out')
    const result = build({ target: 'swift', source: dir, out, fonts: { 'Inter-Bold': 'Inter-Bold' } })
    expect(result.filesCompiled).toBe(1)
  })
})

describe('asset / font / web-host scanners skip what they cannot use', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-cli-scan-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('parseAssetFilename returns null for a name outside the convention', () => {
    expect(parseAssetFilename('README.md')).toBeNull()
  })

  it('scanAssetDir skips sub-directories and unparsable names', () => {
    mkdirSync(join(dir, 'nested'))
    writeFileSync(join(dir, 'README.md'), '')
    writeFileSync(join(dir, 'logo.png'), '')
    const groups = scanAssetDir(dir)
    expect(groups.map((g) => g.name)).toEqual(['logo'])
  })

  it('parseFontFilename returns null for a non-font file', () => {
    expect(parseFontFilename('LICENSE')).toBeNull()
  })

  it('scanFontDir skips sub-directories', () => {
    mkdirSync(join(dir, 'nested'))
    writeFixtureFont(join(dir, 'Inter-Bold.ttf'), 'Inter-Bold')
    expect(scanFontDir(dir).map((f) => f.name)).toEqual(['Inter-Bold'])
  })

  it('sanitizeFontResourceName prefixes a name that starts with a digit', () => {
    // An Android resource name cannot start with a digit; `_` keeps it legal
    // without losing the family name a runtime lookup keys on.
    expect(sanitizeFontResourceName('3270Nerd-Regular')).toMatch(/^_3270/)
    expect(sanitizeFontResourceName('Inter-Bold')).not.toMatch(/^_/)
  })

  it('scanWebHostDir reads `<dir>/webhost` only, tolerates it being a FILE, and skips nested dirs', () => {
    // A `webhost` FILE where a directory is expected is a user mistake that
    // must read as "no hosts", not a statSync throw out of the build.
    const asFile = join(dir, 'a')
    mkdirSync(asFile)
    writeFileSync(join(asFile, 'webhost'), '')
    expect(scanWebHostDir(asFile)).toEqual([])
    const host = join(dir, 'b', 'webhost')
    mkdirSync(join(host, 'nested'), { recursive: true })
    writeFileSync(join(host, 'index.html'), '<html></html>')
    writeFileSync(join(host, 'notes.txt'), '')
    expect(scanWebHostDir(join(dir, 'b')).map((a) => a.filename)).toEqual(['index.html'])
  })
})

describe('native source resolution — the shapes a real install produces', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-cli-ns-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const pkg = (dir: string, manifest: Record<string, unknown>, files: string[] = []) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    for (const rel of files) {
      mkdirSync(join(dir, rel, '..'), { recursive: true })
      writeFileSync(join(dir, rel), '// native\n')
    }
  }

  it('accepts the STRING form of a kotlin declaration and an ABSOLUTE dir', () => {
    const app = join(root, 'app')
    pkg(app, { name: 'app', dependencies: { '@pyreon/a': '*' } })
    const absDir = join(root, 'shared-kotlin')
    mkdirSync(absDir)
    pkg(join(app, 'node_modules', '@pyreon/a'), {
      name: '@pyreon/a',
      pyreon: { native: { kotlin: absDir } },
    })
    const res = resolveNativeSources(app)
    expect(res.kotlin.map((k) => k.dir)).toEqual([absDir])
  })

  it('follows FIRST-PARTY transitive deps only when asked, and never twice', () => {
    // A re-export chain (`@pyreon/ui` depends on `@pyreon/native-runtime-kotlin`)
    // must still aggregate the leaf's sources — but `direct` scope must not,
    // and a diamond must not register the leaf twice.
    const app = join(root, 'app')
    pkg(app, { name: 'app', dependencies: { '@pyreon/ui': '*', '@pyreon/other': '*' } })
    const nm = join(app, 'node_modules')
    pkg(join(nm, '@pyreon/ui'), { name: '@pyreon/ui', dependencies: { '@pyreon/leaf': '*', 'third-party': '*' } })
    pkg(join(nm, '@pyreon/other'), { name: '@pyreon/other', dependencies: { '@pyreon/leaf': '*' } })
    pkg(join(nm, '@pyreon/leaf'), { name: '@pyreon/leaf', pyreon: { native: { kotlin: { dir: 'k' } } } }, ['k/L.kt'])
    // `third-party` is depended on but not installed — the walk must skip it.
    expect(resolveNativeSources(app, { transitiveScope: 'direct' }).kotlin).toEqual([])
    const res = resolveNativeSources(app, { transitiveScope: 'first-party' })
    expect(res.kotlin.map((k) => k.package)).toEqual(['@pyreon/leaf'])
  })

  it('skips a dependency whose package has no manifest', () => {
    const app = join(root, 'app')
    pkg(app, { name: 'app', dependencies: { '@pyreon/broken': '*' } })
    mkdirSync(join(app, 'node_modules', '@pyreon', 'broken'), { recursive: true })
    expect(() => resolveNativeSources(app)).not.toThrow()
  })

  it('computeWiring dedupes a kotlin dir declared by two packages', () => {
    const shared = join(root, 'k')
    mkdirSync(shared)
    const wiring = computeWiring({
      swift: [],
      kotlin: [
        { package: 'a', dir: shared },
        { package: 'b', dir: shared },
      ],
      brokenDeclarations: [],
    })
    expect(wiring.androidSrcDirs).toEqual([shared])
  })
})
