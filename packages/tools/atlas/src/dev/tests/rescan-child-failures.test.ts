/**
 * The ways a rescan child can fail WITHOUT a useful exit, and what each one
 * reports. `atlas dev` keeps the previous catalog on a failed rescan and prints
 * this message, so it has to say what happened even when the child said nothing.
 *
 * Each case replaces the CLI module with a stub that exits on import, which is
 * the whole child's behaviour up to that point. Default `execPath`/`execArgv`
 * are used, so the child is the same runtime running this test.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { scanInChild } from '../rescan'

const dir = mkdtempSync(join(tmpdir(), 'atlas-rescan-fail-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const stub = (name: string, body: string): string => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, body)
  return pathToFileURL(file).href
}
const core = stub('core', 'export const catalogReplacer = (_k, v) => v\n')
const run = (cli: string) => scanInChild({ cwd: dir, dir: 'src', moduleUrls: { cli, core } })

describe('scanInChild failure messages', () => {
  it('a child that exits 0 without writing a catalog says so, bare', async () => {
    await expect(run(stub('silent-ok', 'process.exit(0)\n'))).rejects.toThrow(
      /^\[Pyreon\] atlas dev: the rescan process wrote no catalog$/,
    )
  }, 60_000)

  it('…and carries the child stderr when there is some', async () => {
    await expect(run(stub('noisy-ok', "process.stderr.write('config exploded'); process.exit(0)\n"))).rejects.toThrow(
      /wrote no catalog:\nconfig exploded/,
    )
  }, 60_000)

  it('a silent non-zero exit names the code with no trailing stderr block', async () => {
    await expect(run(stub('silent-fail', 'process.exit(3)\n'))).rejects.toThrow(
      /^\[Pyreon\] atlas dev: the rescan process exited with code 3$/,
    )
  }, 60_000)
})
