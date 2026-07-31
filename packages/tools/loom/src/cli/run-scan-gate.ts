/**
 * The validate-fast entry for the loom gate — `loom scan . --no-write` with
 * the repo root resolved from this file (cwd-independent, like every other
 * gate script). Errors red the gate; warnings stay advisory.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from './index'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const code = await runCli(['scan', repoRoot, '--no-write'])
process.exit(code)
