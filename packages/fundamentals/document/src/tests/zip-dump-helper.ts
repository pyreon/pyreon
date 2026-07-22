import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Test support (not a test file): dump a zip-based binary artifact
 * (docx/pptx/xlsx are all OOXML zips) to a single searchable string —
 * every member's content (`unzip -p` with no entry prints ALL members
 * concatenated) PLUS the member listing (`unzip -l`, so structural
 * checks like "a second slide exists" / "an embedded media file exists"
 * can assert on member PATHS). Decoded as latin1 — binary members
 * (embedded images) become noise bytes but the XML stays searchable.
 *
 * Follows the integration.test.ts precedent: requires the system `unzip`
 * tool and THROWS loudly when it is missing — a skipped binary check must
 * never masquerade as coverage.
 */
export function unzipDump(bytes: Uint8Array, label: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'pyreon-doc-zipdump-'))
  try {
    const filePath = join(tmp, label)
    writeFileSync(filePath, bytes)

    const dump = spawnSync('unzip', ['-p', filePath], {
      encoding: 'latin1',
      timeout: 20_000,
      maxBuffer: 64 * 1024 * 1024,
    })
    if (dump.error || dump.status !== 0) {
      throw new Error(
        `Failed to unzip ${label}: ${dump.error?.message ?? dump.stderr}. ` +
          `This test requires the system 'unzip' tool on PATH.`,
      )
    }

    const listing = spawnSync('unzip', ['-l', filePath], {
      encoding: 'latin1',
      timeout: 20_000,
    })
    if (listing.error || listing.status !== 0) {
      throw new Error(
        `Failed to list ${label}: ${listing.error?.message ?? listing.stderr}. ` +
          `This test requires the system 'unzip' tool on PATH.`,
      )
    }

    return `${dump.stdout}\n${listing.stdout}`
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
