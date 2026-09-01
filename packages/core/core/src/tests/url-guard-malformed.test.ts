/**
 * `isSafeImageDataUri` failed OPEN on a malformed percent-escape.
 *
 * The base64 branch returns "unsafe" when `atob` throws. The percent branch did
 * the opposite: it caught the `decodeURIComponent` failure, kept the RAW
 * still-encoded payload, and scanned that — but `SVG_SCRIPT_RE` matches
 * `<script` and ` on…=`, neither of which appears in `%3Cscript%3E`. So one
 * trailing `%`, enough to make the decode throw and nothing else, took a
 * payload from blocked to allowed:
 *
 *   data:image/svg+xml,%3Cscript%3Ealert(1)%3C/script%3E   → blocked
 *   data:image/svg+xml,%3Cscript%3Ealert(1)%3C/script%3E%  → ALLOWED
 *
 * The function's own docstring already promised the base64 branch's behaviour
 * for both ("malformed payloads are treated as unsafe"), so the two branches
 * disagreeing was the whole defect.
 *
 * Severity, stated: the guard is scoped to `src`/`srcset`/`poster` on
 * `<img>`/`<source>`/`<video>`, where a scripted SVG does not execute — so this
 * is defence-in-depth, and the code comment says so. It is reported because a
 * guard that fails open is worse than one that does not exist: it is relied on.
 *
 * Bisect-verified: restoring the swallow-and-scan-raw branch flips the three
 * malformed specs to `true`.
 */
import { describe, expect, it } from 'vitest'
import { isSafeImageDataUri } from '../url-guard'

const img = (v: string): boolean => isSafeImageDataUri('img', 'src', v)

describe('a malformed data-URI payload is unsafe, in both branches', () => {
  it('a trailing % does not smuggle a scripted SVG past the scan', () => {
    expect(img('data:image/svg+xml,%3Cscript%3Ealert(1)%3C/script%3E')).toBe(false)
    expect(img('data:image/svg+xml,%3Cscript%3Ealert(1)%3C/script%3E%')).toBe(false)
  })

  it('a trailing % does not smuggle an inline handler past the scan', () => {
    expect(img('data:image/svg+xml,%3Csvg onload%3D"alert(1)"%3E%')).toBe(false)
  })

  it('any undecodable percent payload is unsafe, script or not', () => {
    // The rule is "cannot decode ⇒ cannot vouch for it", not "cannot decode ⇒
    // scan whatever bytes are left".
    expect(img('data:image/svg+xml,%zz')).toBe(false)
    expect(img('data:image/svg+xml,%E0%A4')).toBe(false)
  })

  it('the base64 branch already behaved this way and still does', () => {
    expect(img('data:image/svg+xml;base64,!!!not-base64!!!')).toBe(false)
  })

  it('a WELL-FORMED, script-free SVG is still allowed', () => {
    // The guard must not become "block every SVG" — that is the failure mode a
    // fail-closed change invites.
    expect(img('data:image/svg+xml,%3Csvg%3E%3C/svg%3E')).toBe(true)
    expect(img('data:image/svg+xml,%3Csvg%3E%3Crect%20width%3D%2210%22%2F%3E%3C/svg%3E')).toBe(true)
  })

  it('raster data URIs are unaffected', () => {
    expect(img('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  })
})
