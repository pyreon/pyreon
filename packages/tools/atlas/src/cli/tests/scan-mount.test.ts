/**
 * The scan → mount → verdict path, end to end, against the real example.
 *
 * Spawned as a SUBPROCESS rather than called in-process. Mounting boots a Vite
 * module pipeline that loads its own copy of the framework, and this runner
 * already holds one — the singleton sentinel would throw before anything
 * mounted. That is not a workaround: `atlas scan` with mounting enabled is a
 * command that owns its process, and running it that way is the honest test of
 * what a user actually runs.
 *
 * Per the repo's subprocess rule, the assertion is on stdout of a command whose
 * output IS the deliverable (a one-line summary), and the process is given a
 * generous budget because a cold Vite optimise runs on first use.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../../../../..')
/**
 * The BUILT bin, which loads `lib/` — NOT `src/`.
 *
 * So an edit to the CLI's source is INVISIBLE here until `bun scripts/bootstrap.ts`
 * rebuilds it, and this suite keeps passing against the PREVIOUS version's
 * output in the meantime. That is a false green, and it is the spawn-based twin
 * of the dev-server bisect trap in `.claude/rules/testing.md` — observed
 * directly: changing the scan's failure format left both real-scan specs green
 * until a bootstrap ran, and they failed the moment it did.
 *
 * Bisect-verifying anything in this file means: edit source → bootstrap → run.
 */
const BIN = resolve(ROOT, 'packages/tools/atlas/bin/atlas.js')

describe('atlas scan mounts the example', () => {
  it('produces a RUNTIME verdict for every scenario', () => {
    const run = spawnSync(
      'bun',
      [BIN, 'scan', 'examples/atlas-workshop'],
      { cwd: ROOT, encoding: 'utf8', timeout: 300_000 },
    )
    // Exit 1, deliberately: the example carries two REAL a11y failures (the
    // empty-label edge cases below), and a red scan is a red exit — that is
    // the whole CI-gating contract. The stderr line names them so the failure
    // is actionable without opening the JSON.
    expect(run.status, run.stderr).toBe(1)
    // Both scenarios still NAMED — that invariant is unchanged — and now the
    // failing CHECK and its finding are named with them. A bare id list said
    // WHERE to look and withheld WHAT was wrong, which meant opening the
    // catalog JSON to learn which of the six checks had failed.
    expect(run.stderr).toContain('button--empty')
    expect(run.stderr).toContain('badge--empty')
    expect(run.stderr).toContain('a11y: missing accessible name')
    // And the tally answers "which check?" from the summary alone.
    expect(run.stdout).toMatch(/checks:.*a11y \d+\/\d+ ✗/)

    // The exact counts, not just "nothing unverified".
    //
    // Nine components (SearchField in `components/forms/` joins the eight —
    // its nested directory is also the sidebar-hierarchy fixture): the
    // rocketstyle chains in `demo-catalog.tsx`
    // and `components/Chip.tsx` are call expressions, invisible to the static
    // scanner, and are found by loading the module and reading
    // `IS_ROCKETSTYLE`. Their variant/size axes come from
    // `getStaticDimensions`, which is why the scenario count nearly doubles —
    // without the theme in `atlas.config.ts` the axes read as empty. Chip is
    // doubly load-bearing: its `./chip-kit` RELATIVE import is the shape that
    // silently dropped rocketstyle components when discovery handed the loader
    // a relative path — if that regresses, this count drops by one.
    //
    // `0 unverified` alone is too weak to be a regression test: a loader that
    // mounts everything and CRASHES on everything also reports zero unverified,
    // because a failure is a verdict too. Before the mount harness the scan
    // reported "17 verified, 2 failing, 1 unverified" with every runtime check
    // skipped; a broken loader reports "1 verified, 19 failing". Only the pair
    // below distinguishes all three.
    //
    // The 2 failures are the example's deliberate empty-label scenarios, which
    // the static a11y check catches — they are load-bearing here, since a
    // verify pipeline that cannot fail is not verifying anything.
    expect(run.stdout).toMatch(
      /9 component\(s\), 43 scenario\(s\) — 41 verified, 2 failing, 0 unverified/,
    )
    // 320s: the spawn's own descriptive killer is timeout: 300_000 above;
    // the vitest backstop must EXCEED the composed inner budget (the ws-relay
    // rule) — the default 20s killed this opaquely whenever a lockfile change
    // made the scan's Vite dep-optimize run cold (~21s wall).
  }, 320_000)
})
