/**
 * Scan a REAL project — the `atlas-workshop` example — end to end.
 *
 * Every other discovery test feeds `scanSource` a string. This one runs the
 * actual pipeline against actual files on disk, because that is where the
 * example silently stopped being an example: the workshop's demo components
 * were unexported `const`s holding rocketstyle chains, so `atlas scan` found
 * exactly ONE component (the `Workshop` shell) and produced a catalog that said
 * nothing about anything. The workbench UI looked great and the pipeline it
 * exists to feed was never exercised.
 *
 * Nothing failed at the time, which is the point of adding a test rather than
 * just fixing the example: a hollow catalog is indistinguishable from a healthy
 * one unless something asserts the catalog has content.
 */
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runScan } from '../cli/run'

/**
 * `mount: false` throughout.
 *
 * These specs are about DISCOVERY — what the scanner reads out of real source.
 * Mounting would boot a Vite module pipeline that loads its own copy of the
 * framework, and this runner already holds one, so the singleton sentinel
 * throws before a single assertion runs. `runScan` with mounting enabled wants
 * a process to itself; that is what the CLI gives it.
 */

const EXAMPLE = resolve(import.meta.dirname, '../../../../../examples/atlas-workshop')

describe('scanning the atlas-workshop example', () => {
  it('discovers the component library, not just the shell', async () => {
    // `write: false` — a test must not drop build artifacts into the example.
    const result = await runScan({ cwd: EXAMPLE, write: false, mount: false })

    expect(result.components, 'the example must catalog a real library').toBeGreaterThanOrEqual(3)
    expect(result.scenarios, 'components without scenarios teach an agent nothing').toBeGreaterThan(5)
  })

  it('reads real prop types into controls, including unions and accessors', async () => {
    const result = await runScan({ cwd: EXAMPLE, write: false, mount: false })
    // The guide is the agent-facing rendering; asserting on it covers both the
    // extraction and the presentation in one pass.
    const guide = result.guide

    expect(guide).toContain('## Button')
    // A string-literal union must reach the agent as an exact allowed set —
    // this is what stops an assistant inventing `variant="primary"`.
    expect(guide).toMatch(/variant\(solid\|soft\|outline\|ghost\)/)
    expect(guide).toMatch(/size\(sm\|md\|lg\)/)
    // A function-typed prop must be flagged as needing an accessor, since
    // passing a resolved value there captures it once.
    expect(guide).toMatch(/reactive[^\n]*onClick/)
    // `label` is non-optional in the props type, so it must land as required.
    expect(guide).toMatch(/required:[^\n]*label/)
  })

  it('reports verified, failing and unverified separately', async () => {
    const result = await runScan({ cwd: EXAMPLE, write: false, mount: false })

    // The three counts must add up — a scenario cannot be two of them, and a
    // missing bucket is how "unverified" used to hide inside "verified".
    expect(result.verified + result.failed + result.unverified).toBe(result.scenarios)
    expect(result.verified, 'the a11y check should pass on well-formed scenarios').toBeGreaterThan(0)
    // The example deliberately includes a scenario with an empty label, so the
    // a11y check has something real to fail on. If this ever hits zero, the
    // example stopped exercising the failure path.
    expect(result.failed, 'the empty-label scenario must still fail a11y').toBeGreaterThan(0)
  })

  it('names what is wrong in the guide, not just that something is', async () => {
    const result = await runScan({ cwd: EXAMPLE, write: false, mount: false })
    expect(result.guide).toMatch(/avoid:[^\n]*accessible name/)
  })
})
