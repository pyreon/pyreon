/**
 * Permission sets — rendering a scenario as each role sees it.
 *
 * Run against the REAL `@pyreon/permissions` engine, because the interesting
 * behaviour (wildcard precedence, deny-over-grant) is the engine's, and a
 * stubbed `can()` would only confirm this file agrees with itself.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERMISSION_SETS,
  diffSets,
  isUnguarded,
  permissionSetById,
  recordingPermissions,
} from '../permission-sets'

describe('the default sets', () => {
  it('runs least- to most-privileged', () => {
    expect(DEFAULT_PERMISSION_SETS.map((s) => s.id)).toEqual([
      'anonymous',
      'viewer',
      'editor',
      'admin',
    ])
  })

  it('grants nothing to anonymous and everything to admin', () => {
    const anon = recordingPermissions(permissionSetById('anonymous'))
    const admin = recordingPermissions(permissionSetById('admin'))
    for (const key of ['posts.read', 'posts.delete', 'users.manage']) {
      expect(anon.can(key), `anonymous ${key}`).toBe(false)
      expect(admin.can(key), `admin ${key}`).toBe(true)
    }
  })

  it('lets a viewer read but not destroy', () => {
    // The exact bug this panel is for: a destructive action visible to a role
    // that must not have it.
    const viewer = recordingPermissions(permissionSetById('viewer'))
    expect(viewer.can('posts.read')).toBe(true)
    expect(viewer.can('posts.delete')).toBe(false)
    expect(viewer.can('users.manage')).toBe(false)
  })

  it('lets an editor write but still not delete', () => {
    const editor = recordingPermissions(permissionSetById('editor'))
    expect(editor.can('posts.update')).toBe(true)
    expect(editor.can('posts.create')).toBe(true)
    expect(editor.can('posts.delete')).toBe(false)
  })

  it('falls back to the first set for an unknown id, rather than throwing', () => {
    expect(permissionSetById('nope').id).toBe('anonymous')
  })
})

describe('recording', () => {
  it('records every key the component consulted, in first-seen order', () => {
    const rec = recordingPermissions(permissionSetById('viewer'))
    rec.can('posts.read')
    rec.can('posts.delete')
    rec.can('posts.read') // repeat
    expect(rec.consulted()).toEqual(['posts.read', 'posts.delete'])
  })

  it('separates the consulted keys that were DENIED', () => {
    const rec = recordingPermissions(permissionSetById('viewer'))
    rec.can('posts.read')
    rec.can('posts.delete')
    expect(rec.denied()).toEqual(['posts.delete'])
  })

  it('applies the role policy through the key-taking helpers too', () => {
    // A component is as likely to write `can.any(...)` as `can(...)`. When the
    // helpers were forwarded UNWRAPPED, their keys were never seeded, so they
    // fell through to the `'*'` default — the role silently did not apply, and
    // the keys were missing from the consulted list that the "it never asked"
    // finding depends on.
    const viewer = recordingPermissions(permissionSetById('viewer'))
    expect(viewer.can.any('posts.read', 'posts.delete')).toBe(true)
    expect(viewer.can.all('posts.read', 'posts.delete')).toBe(false)
    expect(viewer.can.not('posts.delete')).toBe(true)
    // and every key reached that way is recorded
    expect(viewer.consulted().sort()).toEqual(['posts.delete', 'posts.read'])
    expect(viewer.denied()).toEqual(['posts.delete'])
  })

  it('forwards the rest of the Permissions surface', () => {
    // Dropping `can.not` / `can.all` would change the behaviour of the
    // component under test, which would make every verdict here worthless.
    const rec = recordingPermissions(permissionSetById('viewer'))
    expect(typeof rec.can.not).toBe('function')
    expect(rec.can.not('posts.delete')).toBe(true)
    expect(rec.can.all('posts.read', 'posts.delete')).toBe(false)
    expect(rec.can.any('posts.read', 'posts.delete')).toBe(true)
  })
})

describe('the finding with teeth', () => {
  it('flags a component that consulted NOTHING as unguarded', () => {
    // Rendering identically under every set is only reassuring if the component
    // ASKED and got the same answer. If it never asked, the sets prove nothing
    // — and that is what an unguarded destructive action looks like.
    expect(isUnguarded([])).toBe(true)
    expect(isUnguarded(['posts.read'])).toBe(false)
  })
})

describe('diffing two sets', () => {
  it('names what a role gains, loses, and never gets', () => {
    const viewer = recordingPermissions(permissionSetById('viewer'))
    const editor = recordingPermissions(permissionSetById('editor'))
    for (const rec of [viewer, editor]) {
      rec.can('posts.read')
      rec.can('posts.update')
      rec.can('posts.delete')
    }

    const diff = diffSets(
      { consulted: viewer.consulted(), denied: viewer.denied() },
      { consulted: editor.consulted(), denied: editor.denied() },
    )
    expect(diff.gained).toEqual(['posts.update'])
    expect(diff.lost).toEqual([])
    // Neither role may delete — the key both were denied.
    expect(diff.alwaysDenied).toEqual(['posts.delete'])
  })

  it('reports a key granted to the LOWER role but not the higher as lost', () => {
    // A real misconfiguration shape, and one a human scanning two screenshots
    // would miss.
    const diff = diffSets(
      { consulted: ['a'], denied: [] },
      { consulted: ['a'], denied: ['a'] },
    )
    expect(diff.lost).toEqual(['a'])
    expect(diff.gained).toEqual([])
  })
})
