/**
 * Every hook that touches a secure-context-gated Web API must report WHY it is
 * unavailable.
 *
 * This exists because wiring the diagnostic by hand left five of eight gated
 * hooks silent, while the docs and changeset claimed all of them explained
 * themselves. Hand-wiring a cross-cutting concern one file at a time is not a
 * thing anyone finishes reliably — so the coverage is asserted rather than
 * remembered, and a NEW gated hook cannot ship without it.
 *
 * The check is static because the alternative cannot work: the diagnostic
 * fires only when `isSecureContext === false`, and a happy-dom suite is always
 * a secure context, so no behavioural test can tell a wired hook from an
 * unwired one.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..')

/**
 * Access patterns for APIs the web platform gates behind a secure context.
 *
 * Deliberately keyed on the ACCESS, not on a hook name or a mention: `usePush`
 * discusses `PushManager` in a comment while never calling it (the app owns
 * that flow), and blaming TLS for a hook that never touches a gated API would
 * be a false positive in the one place a warning has to be trustworthy.
 *
 * Equally deliberate about what is NOT here. `useCamera` uses
 * `<input type="file" capture>` — a file picker, which works fine over plain
 * HTTP — and `useSpeech` uses `speechSynthesis`, which is not gated (only
 * SpeechRecognition is). Both were listed as gated in the original docs; both
 * were wrong, and warning for them would send someone to configure TLS for a
 * problem TLS cannot fix.
 */
const GATED_ACCESS: readonly RegExp[] = [
  /navigator\.geolocation/,
  /navigator\.mediaDevices/,
  /navigator\.bluetooth/,
  /navigator\.clipboard/,
  /navigator\.share/,
  /navigator\.wakeLock|'wakeLock' in navigator/,
  /\bDeviceMotionEvent\b/,
  /new Notification\b|Notification\.(requestPermission|permission)/,
]

/** Strip comments so a MENTION of an API never counts as an access. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
}

function hookFiles(): string[] {
  return readdirSync(SRC).filter((f) => /^use[A-Z].*\.ts$/.test(f))
}

describe('secure-context diagnostic coverage', () => {
  it('has hooks to check at all — an empty scan must not read as a pass', () => {
    expect(hookFiles().length).toBeGreaterThan(20)
  })

  it('every hook touching a gated API reports why it is unavailable', () => {
    const unwired: string[] = []
    for (const file of hookFiles()) {
      const source = code(readFileSync(join(SRC, file), 'utf8'))
      const gated = GATED_ACCESS.filter((re) => re.test(source))
      if (gated.length === 0) continue
      if (!/warnIfInsecureContext\s*\(/.test(source)) {
        unwired.push(`${file} (touches ${gated.map((r) => r.source).join(', ')})`)
      }
    }
    expect(unwired).toEqual([])
  })

  it('names the hook it is called from, so the message is actionable', () => {
    // `warnIfInsecureContext()` with no argument, or with the wrong hook's
    // name, produces a message that cannot be acted on.
    const mismatched: string[] = []
    for (const file of hookFiles()) {
      const source = code(readFileSync(join(SRC, file), 'utf8'))
      for (const call of source.match(/warnIfInsecureContext\([^)]*\)/g) ?? []) {
        const expected = `'${file.replace(/\.ts$/, '')}'`
        if (!call.includes(expected)) mismatched.push(`${file}: ${call}`)
      }
    }
    expect(mismatched).toEqual([])
  })
})
