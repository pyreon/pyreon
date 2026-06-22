// Shared client/server validation — the headline proof: ONE schema, ONE
// syntax, validated lightweight on the client and superior on the server,
// switched purely by whether `@pyreon/validate/server` has been imported
// (installs strict validators into the format registry).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { uninstallFormatValidator } from '../core/registry'
import { isDisposableEmail, installServerValidators, strictEmail, strictPhone } from '../server'
import { s, type Infer } from '../v1'

// NOTE: importing `../server` runs its install side-effect once at module
// load — that IS the mechanism. So reset to the lightweight (client)
// defaults BEFORE each test; tests that exercise the server path call
// `installServerValidators()` themselves.
const reset = (): void => {
  uninstallFormatValidator('email')
  uninstallFormatValidator('phone')
}
beforeEach(reset)
afterEach(reset)

describe('shared schema — same definition, light on client, strict on server', () => {
  // ONE schema, written once, shared between client and server.
  const Signup = s.object({
    email: s.string().email(),
    phone: s.string().phone(),
  })

  const disposable = { email: 'user@mailinator.com', phone: '4155552671' } // valid-ish, no +
  const clean = { email: 'ada@example.com', phone: '+14155552671' }

  it('CLIENT (no /server import): lightweight — accepts the format-valid input', () => {
    // Disposable domain + no-`+` phone both pass the lightweight checks.
    expect(Signup.parse(disposable).ok).toBe(true)
    expect(Signup.parse(clean).ok).toBe(true)
  })

  it('SERVER (after installing strict validators): the SAME schema rejects what the client allowed', () => {
    installServerValidators()
    // email: disposable domain now rejected; phone: missing `+` now rejected.
    const r = Signup.parse(disposable)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const paths = r.issues.map((i) => i.path?.[0])
      expect(paths).toContain('email')
      expect(paths).toContain('phone')
    }
    // A clean, fully-E.164 input still passes server-side.
    expect(Signup.parse(clean).ok).toBe(true)
  })

  it('the switch is dynamic — a schema parsed BEFORE install picks up strict AFTER', () => {
    // Parse once (compiles + caches the validator closure) while light.
    expect(Signup.parse(disposable).ok).toBe(true)
    // Now upgrade to server validators…
    installServerValidators()
    // …the SAME cached schema now validates strictly (registry is read at
    // parse time, not baked at compile time).
    expect(Signup.parse(disposable).ok).toBe(false)
  })

  it('type inference is identical on both sides (one schema, one type)', () => {
    const _t: { email: string; phone: string } = {} as Infer<typeof Signup>
    expect(_t).toBeDefined()
  })
})

describe('strict server email', () => {
  it('rejects disposable domains the client allows', () => {
    expect(strictEmail('a@example.com')).toBe(true)
    expect(strictEmail('a@mailinator.com')).toBe(false)
    expect(isDisposableEmail('x@guerrillamail.com')).toBe(true)
    expect(isDisposableEmail('x@example.com')).toBe(false)
  })
  it('enforces rfc5322 length limits', () => {
    expect(strictEmail('a'.repeat(65) + '@b.co')).toBe(false)
  })
})

describe('strict server phone (full E.164)', () => {
  it('requires a leading + (which the client default does not)', () => {
    expect(strictPhone('+14155552671')).toBe(true)
    expect(strictPhone('14155552671')).toBe(false) // no + → strict rejects
    expect(strictPhone('+1 (415) 555-2671')).toBe(true) // separators stripped
    expect(strictPhone('+0123')).toBe(false) // leading 0 / too short
  })
})
