// The Android release-smoke harness decides whether the UNTOUCHED (R8-minified,
// no test keeps) release APK actually rendered, by reading the accessibility
// tree through `uiautomator dump`. That command loses a race on a contended
// emulator — and, critically, it announces the loss in its OUTPUT while still
// exiting 0.
//
// The pre-fix harness guarded on the EXIT CODE, so a lost race fell through to
// `cat $DUMP` and read whatever file was already there. That is not a flake, it
// is an undecidable gate: a stale tree containing the marker is a false PASS for
// an app that never rendered, and a stale pre-launch tree is a false FAIL.
//
// These specs drive the real script with a stubbed `adb` (and a stubbed `sleep`,
// so the 20-poll backoff does not cost a minute) and pin all three verdicts.
// Bisect-verified: restoring the exit-code guard turns the FIRST spec green-on-
// broken (it reports the stale tree as a pass), which is exactly the hole.

import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../../..')
const SCRIPT = join(REPO_ROOT, 'examples/native-todomvc-android/scripts/release-smoke.sh')

/** A tree the marker-check should accept as a genuine render. */
const TREE_WITH_MARKER =
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">` +
  `<node index="0" class="android.widget.FrameLayout" text="">` +
  `<node index="1" class="android.widget.TextView" text="2 remaining" />` +
  `<node index="2" class="android.widget.TextView" text="Pyreon TodoMVC" />` +
  `</node></hierarchy>`

/** Same shape, app rendered, marker genuinely absent — a real regression. */
const TREE_WITHOUT_MARKER = TREE_WITH_MARKER.replace('2 remaining', 'Pyreon')

interface RunResult {
  status: number
  out: string
}

/**
 * Run the real script in a sandbox with a fake `adb` on PATH.
 *
 * @param mode - `race` = every dump loses the race (prints the error, exits 0)
 *   while a stale dump file with the marker already sits on "device";
 *   `rendered` / `blank` = dumps succeed and write the given tree.
 */
function runSmoke(mode: 'race' | 'rendered' | 'blank'): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-smoke-'))
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, 'app/build/outputs/apk/release'), { recursive: true })
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(join(dir, 'app/build/outputs/apk/release/app-release.apk'), 'not-a-real-apk')
  cpSync(SCRIPT, join(dir, 'scripts/release-smoke.sh'))
  chmodSync(join(dir, 'scripts/release-smoke.sh'), 0o755)

  // `$STATE` stands in for the device filesystem: whatever `cat` would return.
  // In `race` mode it is SEEDED with a marker-bearing tree, modelling a stale
  // file left by an earlier successful poll. A harness that reads it is wrong.
  const state = join(dir, 'device-dump.xml')
  if (mode === 'race') writeFileSync(state, TREE_WITH_MARKER)

  const tree = mode === 'rendered' ? TREE_WITH_MARKER : TREE_WITHOUT_MARKER
  const adb = `#!/usr/bin/env bash
# Fake adb. Only the calls the smoke script makes are modelled.
STATE=${JSON.stringify(state)}
MODE=${JSON.stringify(mode)}
if [ "$1" = "shell" ]; then
  shift
  case "$1" in
    rm)   [ "$MODE" = "race" ] || rm -f "$STATE"; exit 0 ;;
    cat)  cat "$STATE" 2>/dev/null; exit 0 ;;
    uiautomator)
      if [ "$MODE" = "race" ]; then
        # The documented failure: it TELLS you on stdout and still exits 0.
        echo "ERROR: could not get idle state."
        exit 0
      fi
      printf '%s' ${JSON.stringify(tree)} > "$STATE"
      echo "UI hierchary dumped to: /sdcard/pyreon-smoke.xml"
      exit 0 ;;
    *) exit 0 ;;
  esac
fi
exit 0
`
  writeFileSync(join(dir, 'bin/adb'), adb)
  chmodSync(join(dir, 'bin/adb'), 0o755)
  // Keep the 20-poll backoff from costing a real minute.
  writeFileSync(join(dir, 'bin/sleep'), '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(join(dir, 'bin/sleep'), 0o755)

  try {
    const out = execFileSync('bash', [join(dir, 'scripts/release-smoke.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('Android release-smoke — the uiautomator race must not be decidable by exit code', () => {
  it('the script under test exists (else every non-zero assertion below is vacuous)', () => {
    expect(() => execFileSync('test', ['-f', SCRIPT])).not.toThrow()
  })

  it('a LOST race over a stale marker-bearing tree FAILS — never a false pass', () => {
    const r = runSmoke('race')
    expect(r.status, r.out).not.toBe(0)
    expect(r.out).toContain('never obtained a valid accessibility tree')
  })

  it('names a lost race as a HARNESS failure, so nobody hunts an app regression', () => {
    const r = runSmoke('race')
    expect(r.out).toContain('says NOTHING about the app')
    expect(r.out).not.toContain('APP-SIDE verdict')
  })

  it('a VALID tree missing the marker FAILS as an APP-SIDE verdict', () => {
    const r = runSmoke('blank')
    expect(r.status, r.out).not.toBe(0)
    expect(r.out).toContain('APP-SIDE verdict')
    // and it must report the tree it actually read, not "(none)"
    expect(r.out).toContain('<hierarchy')
  })

  it('a VALID tree containing the marker PASSES', () => {
    const r = runSmoke('rendered')
    expect(r.status, r.out).toBe(0)
    expect(r.out).toContain('launched and rendered')
  })
})
