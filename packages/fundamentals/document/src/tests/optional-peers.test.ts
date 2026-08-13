/**
 * The four binary-format libraries are OPTIONAL PEERS, never dependencies.
 *
 * They were `optionalDependencies`, which reads as "optional" and is not: every
 * package manager INSTALLS optionalDependencies by default (the word means
 * "tolerate an install failure", e.g. for platform-specific binaries — see
 * `@pyreon/compiler`, where the usage IS correct). So every consumer of
 * `@pyreon/document` was force-fed pdfmake + docx + exceljs + pptxgenjs whether
 * or not they ever emitted a binary format — carrying their install weight AND
 * their CVE surface. Two live advisories reached consumers that way
 * (exceljs → uuid, pptxgenjs → image-size).
 *
 * The renderers were always written for peer semantics: each `await import()`s
 * its library and throws a named, actionable error when it is absent. This test
 * locks the package manifest to the contract the CODE already implements, and
 * locks the error messages to the install command they must name — a renderer
 * that fails without naming its package sends the reader hunting.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PKG_ROOT = join(import.meta.dirname, '../..')

interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

const pkg: Manifest = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))

/** library → the renderer source that lazy-imports it. */
const BINARY_RENDERERS = {
  pdfmake: 'pdf.ts',
  docx: 'docx.ts',
  exceljs: 'xlsx.ts',
  pptxgenjs: 'pptx.ts',
} as const

describe('binary-format libraries are optional peers, not installed dependencies', () => {
  for (const lib of Object.keys(BINARY_RENDERERS)) {
    it(`${lib} is an OPTIONAL peer and is never force-installed`, () => {
      expect(pkg.peerDependencies?.[lib], `${lib} must be a peerDependency`).toBeDefined()
      expect(
        pkg.peerDependenciesMeta?.[lib]?.optional,
        `${lib} must be marked optional — a REQUIRED peer is installed by npm 7+ ` +
          `and warned about by every other package manager`,
      ).toBe(true)

      // The regression this file exists for: either of these installs the
      // library into every consumer's tree.
      expect(pkg.optionalDependencies?.[lib], `${lib} must NOT be an optionalDependency`).toBeUndefined()
      expect(pkg.dependencies?.[lib], `${lib} must NOT be a dependency`).toBeUndefined()

      // …while OUR OWN suite still exercises the renderer for real.
      expect(pkg.devDependencies?.[lib], `${lib} must stay a devDependency`).toBeDefined()
    })
  }

  it('every renderer names its install command when the library is absent', () => {
    // An optional peer is only honest if the failure tells you what to install.
    for (const [lib, file] of Object.entries(BINARY_RENDERERS)) {
      const src = readFileSync(join(PKG_ROOT, 'src/renderers', file), 'utf8')
      expect(src, `${file} must lazy-import ${lib}`).toMatch(new RegExp(`import\\(['"]${lib}`))
      expect(src, `${file} must tell the reader to install ${lib}`).toContain(`bun add ${lib}`)
    }
  })
})
