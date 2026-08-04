/**
 * The `loom` section of `pyreon.config.*`.
 *
 * Two homes, one shape: the root `package.json`'s `loom` key (which predates
 * the shared file) and `pyreon.config.*`'s `loom` section. Both go through the
 * SAME validator, because two validators would let one home accept what the
 * other rejects — a config that works until you move it.
 *
 * Precedence mirrors atlas: the per-tool location (here, the manifest) wins
 * per-key over the shared file. A project with both has almost certainly just
 * started migrating, and having the general file silently override the
 * specific one mid-migration is the worst possible ordering.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ISSUE_CODES,
  buildReport,
  loadSharedLoomConfig,
  mergeLoomSettings,
  readManifestLoomSection,
  validateLoomSection,
} from '../core'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

/** A workspace whose root may carry a manifest `loom` key and/or a config file. */
function workspace(opts: {
  manifestLoom?: unknown
  configSource?: string
  files?: Record<string, string>
  pkg?: Record<string, unknown>
}): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-cfg-'))
  roots.push(root)
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'r',
      workspaces: ['p/*'],
      ...(opts.manifestLoom !== undefined ? { loom: opts.manifestLoom } : {}),
    }),
  )
  mkdirSync(join(root, 'p/a/src'), { recursive: true })
  writeFileSync(
    join(root, 'p/a/package.json'),
    JSON.stringify({ name: 'a', version: '1.0.0', private: true, ...opts.pkg }),
  )
  for (const [rel, body] of Object.entries(opts.files ?? {})) {
    writeFileSync(join(root, 'p/a', rel), body)
  }
  if (opts.configSource !== undefined) {
    writeFileSync(join(root, 'pyreon.config.mjs'), opts.configSource)
  }
  return root
}

describe('validateLoomSection — one validator for both homes', () => {
  it('accepts a full section and normalises it', () => {
    const s = validateLoomSection(
      {
        devPaths: ['src/manifest.ts'],
        ignore: [{ pkg: 'a', dep: 'b', code: 'phantom-dep', reason: 'vendored' }],
        strict: true,
        severity: { 'unused-dep': 'error' },
      },
      'test',
    )
    expect(s.devPaths).toEqual(['src/manifest.ts'])
    expect(s.ignores?.[0]?.reason).toBe('vendored')
    expect(s.strict).toBe(true)
    expect(s.severity?.['unused-dep']).toBe('error')
  })

  it('an absent section is not an error', () => {
    expect(validateLoomSection(undefined, 'test')).toEqual({})
  })

  it('rejects a non-object section, a bad devPaths, and a non-boolean strict', () => {
    expect(() => validateLoomSection([], 'test')).toThrow(/`loom` must be an object/)
    expect(() => validateLoomSection({ devPaths: 'x' }, 'test')).toThrow(/devPaths` must be an array/)
    expect(() => validateLoomSection({ strict: 'yes' }, 'test')).toThrow(/strict` must be a boolean/)
  })

  it('keeps the mandatory-reason rule for ignore entries', () => {
    // The rule that makes suppressions honest: an unexplained one is a lie
    // waiting to age. It must hold in BOTH homes, which is why it lives here.
    expect(() => validateLoomSection({ ignore: [{ pkg: 'a' }] }, 'test')).toThrow(
      /needs a non-empty `reason`/,
    )
    expect(() => validateLoomSection({ ignore: [{ pkg: 'a', reason: '  ' }] }, 'test')).toThrow(
      /needs a non-empty `reason`/,
    )
  })

  it('names an unknown severity code instead of ignoring it, and lists the real ones', () => {
    // A typo'd code that silently does nothing is the failure this whole
    // config surface exists to reduce.
    let message = ''
    try {
      validateLoomSection({ severity: { 'phantom-deps': 'error' } }, 'test')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toMatch(/unknown code `phantom-deps`/)
    for (const code of ISSUE_CODES) expect(message).toContain(code)
  })

  it('rejects a severity level that is not error | warning | info', () => {
    expect(() => validateLoomSection({ severity: { 'unused-dep': 'off' } }, 'test')).toThrow(
      /must be one of error \| warning \| info/,
    )
  })
})

describe('mergeLoomSettings — the manifest wins PER KEY', () => {
  it('a manifest key overrides the shared one', () => {
    const merged = mergeLoomSettings({ strict: true, devPaths: ['shared'] }, { strict: false })
    expect(merged.strict).toBe(false)
    // …and a key the manifest does NOT mention survives from the shared file.
    // Whole-object precedence would have blanked this, which is why the merge
    // is per-key.
    expect(merged.devPaths).toEqual(['shared'])
  })

  it('severity maps merge, with manifest entries winning individually', () => {
    const merged = mergeLoomSettings(
      { severity: { 'unused-dep': 'error', 'version-drift': 'info' } },
      { severity: { 'unused-dep': 'info' } },
    )
    expect(merged.severity).toEqual({ 'unused-dep': 'info', 'version-drift': 'info' })
  })

  it('empty on both sides yields usable defaults', () => {
    expect(mergeLoomSettings({}, {})).toEqual({ devPaths: [], ignores: [], severity: {} })
  })
})

describe('loadSharedLoomConfig', () => {
  it('is silent when there is no config file at all', async () => {
    expect(await loadSharedLoomConfig(workspace({}))).toEqual({})
  })

  it('is silent when the file exists with no loom key — that is another tool config', async () => {
    const root = workspace({ configSource: 'export default { atlas: { title: "x" } }\n' })
    expect(await loadSharedLoomConfig(root)).toEqual({})
  })

  it('reads the section from a default export and from a named one', async () => {
    const viaDefault = workspace({
      configSource: 'export default { loom: { devPaths: ["src/gen.ts"] } }\n',
    })
    expect((await loadSharedLoomConfig(viaDefault)).devPaths).toEqual(['src/gen.ts'])

    const viaNamed = workspace({ configSource: 'export const loom = { devPaths: ["src/n.ts"] }\n' })
    expect((await loadSharedLoomConfig(viaNamed)).devPaths).toEqual(['src/n.ts'])
  })

  it('a config file that EXISTS but cannot load is a loud, named failure', async () => {
    // Never silent. A project that wrote settings and had them dropped gets a
    // puzzling afternoon; the message names the file and the way out.
    const root = workspace({ configSource: 'export default { loom: { this is not valid\n' })
    await expect(loadSharedLoomConfig(root)).rejects.toThrow(/could not load .*pyreon\.config\.mjs/)
    await expect(loadSharedLoomConfig(root)).rejects.toThrow(/package\.json/)
  })
})

describe('readManifestLoomSection', () => {
  it('returns the manifest loom key, and undefined when there is none', () => {
    expect(readManifestLoomSection(workspace({ manifestLoom: { strict: true } }))).toEqual({
      strict: true,
    })
    expect(readManifestLoomSection(workspace({}))).toBeUndefined()
  })

  it('an unreadable directory is undefined, not a throw — scanWorkspace reports it better', () => {
    expect(readManifestLoomSection('/definitely/not/a/directory')).toBeUndefined()
  })
})

describe('settings reach the report', () => {
  const manifestFile = {
    'src/manifest.ts': `import { defineManifest } from '@scope/manifest'\nexport default defineManifest({})`,
  }

  it('devPaths from settings silences prod-import-of-dev-dep', () => {
    const root = workspace({ files: manifestFile, pkg: { devDependencies: { '@scope/manifest': '^1.0.0' } } })
    expect(
      buildReport(root).issues.filter((i) => i.code === 'prod-import-of-dev-dep'),
    ).toHaveLength(1)
    expect(
      buildReport(root, { settings: { devPaths: ['src/manifest.ts'] } }).issues.filter(
        (i) => i.code === 'prod-import-of-dev-dep',
      ),
    ).toHaveLength(0)
  })

  it('a severity override raises a code, and stats follow', () => {
    const root = workspace({
      files: { 'src/i.ts': 'export const x = 1' },
      pkg: { dependencies: { 'unused-pkg': '^1.0.0' } },
    })
    expect(buildReport(root).stats.errors).toBe(0)
    const raised = buildReport(root, { settings: { severity: { 'unused-dep': 'error' } } })
    expect(raised.stats.errors).toBe(1)
    expect(raised.issues.find((i) => i.code === 'unused-dep')?.severity).toBe('error')
  })

  it('an explicit ignore still wins over a severity raise', () => {
    // Order matters: a project that deliberately waved one finding through
    // should not have it resurrected by a blanket severity raise.
    const root = workspace({
      files: { 'src/i.ts': 'export const x = 1' },
      pkg: { dependencies: { 'unused-pkg': '^1.0.0' } },
    })
    const report = buildReport(root, {
      settings: {
        severity: { 'unused-dep': 'error' },
        ignores: [{ dep: 'unused-pkg', reason: 'loaded by a bin at runtime' }],
      },
    })
    const issue = report.issues.find((i) => i.code === 'unused-dep')
    expect(issue?.severity).toBe('info')
    expect(issue?.message).toMatch(/ignored: loaded by a bin at runtime/)
    expect(report.stats.errors).toBe(0)
  })
})
