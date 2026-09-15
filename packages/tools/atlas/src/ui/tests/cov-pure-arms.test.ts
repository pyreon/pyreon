/**
 * The small arms the curated fixtures in the sibling suites do not reach —
 * deterministic ties, fallback paths, and one-off flags.
 *
 * Each is paired with the shape it must be distinguished FROM: a tie-break is
 * only meaningful next to a non-tie, and a fallback only next to the value it
 * falls back from.
 */
import { describe, expect, it } from 'vitest'
import { buildSearch, buildSearchIndex, type WorkbenchCatalog, type WorkbenchComponent } from '../catalog'
import { grants, type PermissionSet } from '../permission-sets'
import { counterDelta } from '../perf-counters'
import { fieldToControl, validateValues } from '../schema-controls'
import { hotKeys, type StoreTimeline } from '../store-timeline'
import { parseUrlState, pathBase, serializeUrlState } from '../url-state'

const comp = (over: Partial<WorkbenchComponent> & { id: string }): WorkbenchComponent =>
  ({
    name: over.id,
    group: 'G',
    controls: [],
    render: () => null,
    ...over,
  }) as unknown as WorkbenchComponent

describe('catalog search — the description field', () => {
  const catalog: WorkbenchCatalog = {
    components: [
      comp({ id: 'button', name: 'Button', desc: 'A clickable affordance for submitting' }),
      comp({ id: 'badge', name: 'Badge' }),
    ],
  }

  it('matches on a component DESCRIPTION, and says that is why', () => {
    const hits = buildSearchIndex(catalog)('affordance')
    expect(hits.map((h) => h.id)).toEqual(['button'])
    expect(hits[0]!.reason).toBe('description')
  })

  it('ranks a description match BELOW a name match — a weak signal stays weak', () => {
    // Both components would match "b"; the one matching by name must win, or
    // the description field turns every long blurb into a top hit.
    const hits = buildSearchIndex(catalog)('badge')
    expect(hits[0]!.id).toBe('badge')
  })

  it('a component with no description is still searchable by everything else', () => {
    expect(buildSearchIndex(catalog)('badge').map((h) => h.id)).toEqual(['badge'])
  })

  it('the id-only view returns CATALOG order, not match order', () => {
    // The sidebar tree keeps its curated ordering; ranking belongs to the
    // dialog. Searching a term that hits the second component first must still
    // come back in catalog order.
    expect(buildSearch(catalog)('b')).toEqual(['button', 'badge'])
  })
})

describe('permission-sets — an explicit per-key grant', () => {
  const set = (over: Partial<PermissionSet>): PermissionSet =>
    ({ id: 'r', label: 'R', hint: '', verbs: [], defaultGrant: false, ...over }) as PermissionSet

  it('an explicit `grants` entry wins over a role that grants nothing by default', () => {
    expect(grants(set({ grants: ['post.delete'] }), 'post.delete')).toBe(true)
  })

  it('and it does NOT leak to a key it does not name', () => {
    expect(grants(set({ grants: ['post.delete'] }), 'post.publish')).toBe(false)
  })

  it('a role with no `grants` list at all falls through to its verbs', () => {
    expect(grants(set({ verbs: ['read'] }), 'post.read')).toBe(true)
    expect(grants(set({ verbs: ['read'] }), 'post.delete')).toBe(false)
  })

  it('treats an UNDOTTED key as the verb itself, not as a resource with no verb', () => {
    // `can('read')` is a legitimate call. Slicing after a dot that is not there
    // would leave the whole key and happen to work; taking the key as the verb
    // is what makes the pairing below hold.
    expect(grants(set({ verbs: ['read'] }), 'read')).toBe(true)
    expect(grants(set({ verbs: ['read'] }), 'delete')).toBe(false)
  })

  it('and the dotted form of the same verb agrees with it', () => {
    expect(grants(set({ verbs: ['read'] }), 'posts.read')).toBe(true)
  })
})

describe('perf counters — deterministic ordering', () => {
  it('breaks a delta TIE by name, so the panel does not reshuffle between reads', () => {
    const rows = counterDelta({}, { zebra: 2, alpha: 2, mid: 2 })
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'mid', 'zebra'])
  })

  it('still sorts by delta FIRST — the tie-break must not outrank the magnitude', () => {
    const rows = counterDelta({}, { alpha: 1, zebra: 9 })
    expect(rows.map((r) => r.name)).toEqual(['zebra', 'alpha'])
  })
})

describe('store timeline — hot keys ordering', () => {
  const timeline = (keys: string[][]): StoreTimeline =>
    ({
      steps: keys.map((ks, i) => ({
        id: i,
        store: 's',
        type: 'set',
        t: '0',
        changes: ks.map((key) => ({ key, oldValue: 0, newValue: 1 })),
        state: {},
      })),
    }) as unknown as StoreTimeline

  it('breaks a write-count TIE by key name', () => {
    expect(hotKeys(timeline([['b', 'a'], ['b', 'a']]))).toEqual([
      { key: 'a', writes: 2 },
      { key: 'b', writes: 2 },
    ])
  })

  it('still sorts by write count FIRST', () => {
    expect(hotKeys(timeline([['a', 'b'], ['a', 'b'], ['a']]))).toEqual([
      { key: 'a', writes: 3 },
      { key: 'b', writes: 2 },
    ])
  })
})

describe('url-state — pathBase against a path that does not end in the id', () => {
  it('returns the whole path when the id is not its last segment', () => {
    // A defensive pairing: the caller resolves the id from the same pathname,
    // so a mismatch means the two disagree — and dropping a segment on a guess
    // would write a URL pointing at a directory that does not exist.
    expect(pathBase('/atlas/modal/', 'button')).toBe('/atlas/modal/')
  })

  it('strips it when it IS the last segment', () => {
    expect(pathBase('/atlas/button/', 'button')).toBe('/atlas/')
  })

  it('adds the trailing slash a path URL needs', () => {
    expect(pathBase('/atlas/button', 'button')).toBe('/atlas/')
  })
})

describe('url-state — the background parameter', () => {
  it('round-trips a non-default background', () => {
    expect(parseUrlState('?background=dark').background).toBe('dark')
    expect(serializeUrlState({ background: 'dark' })).toBe('background=dark')
  })

  it('omits the DEFAULT background, so a shared link stays readable', () => {
    expect(serializeUrlState({ background: 'theme' })).toBe('')
    expect(parseUrlState('?background=').background).toBeUndefined()
  })
})

describe('schema-controls — an issue with no path and no message', () => {
  // A Standard Schema issue is only required to carry a message; the path is
  // optional and a whole-object refinement has none. The panel renders both
  // cells, so neither may become "undefined".
  const schema = (issues: readonly unknown[]) =>
    ({
      '~standard': { version: 1, vendor: 'test', validate: () => ({ issues }) },
    }) as unknown as Parameters<typeof validateValues>[0]

  it('renders an EMPTY path for an object-level issue rather than "undefined"', () => {
    const state = validateValues(schema([{ message: 'passwords must match' }]), {})
    expect(state).toEqual({
      state: 'invalid',
      issues: [{ path: '', message: 'passwords must match' }],
    })
  })

  it('renders "invalid" for an issue carrying no message at all', () => {
    const state = validateValues(schema([{ path: ['email'] }]), {})
    expect(state).toEqual({ state: 'invalid', issues: [{ path: 'email', message: 'invalid' }] })
  })

  it('still joins a real nested path', () => {
    const state = validateValues(schema([{ path: ['user', 'email'], message: 'bad' }]), {})
    expect(state).toEqual({ state: 'invalid', issues: [{ path: 'user.email', message: 'bad' }] })
  })
})

describe('schema-controls — a number field edits as text', () => {
  it('leaves the SCHEMA as the authority on what is valid', () => {
    expect(fieldToControl({ name: 'age', label: 'Age', type: 'number', optional: false })).toEqual({
      key: 'age',
      label: 'Age',
      type: 'text',
      default: '',
    })
  })
})
