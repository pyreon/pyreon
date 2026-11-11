/**
 * The Atlas v2 design parts that needed a data source (#4440): the stage
 * layout, every role judged side by side, each control's provenance and
 * "added N min ago", and the Lens's "Fix:" line.
 *
 * Pure logic only — the panels that render it are proven in real Chromium by
 * `e2e/atlas-shell.spec.ts`.
 *
 * @vitest-environment happy-dom
 */
import { h } from '@pyreon/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { CANVAS_LAYOUTS, parseLayout } from '../addons'
import type { WorkbenchCatalog, WorkbenchControl } from '../catalog'
import { lensFix } from '../lens-client'
import { createModel } from '../model'
import {
  ACTION_VERBS,
  DEFAULT_PERMISSION_SETS,
  judgeRole,
  policyFor,
  renderedActions,
  verbOf,
} from '../permission-sets'
import { addedAgo, NEW_FOR_MS, schemaRows, SOURCE_LABEL } from '../schema-controls'
import { parseUrlState, serializeUrlState } from '../url-state'
import { z } from 'zod'
import { extractFields } from '@pyreon/feature'

beforeEach(() => {
  history.replaceState(null, '', '/')
})

const role = (id: string) => DEFAULT_PERMISSION_SETS.find((r) => r.id === id)!

describe('stage layout', () => {
  it('offers the three Storybook layouts and parses only those', () => {
    expect(CANVAS_LAYOUTS.map((l) => l.id)).toEqual(['centered', 'padded', 'fullscreen'])
    expect(parseLayout('padded')).toBe('padded')
    expect(parseLayout('sideways')).toBeUndefined()
    expect(parseLayout(undefined)).toBeUndefined()
  })

  it('travels in a link only when it is not the default', () => {
    expect(serializeUrlState({ layout: 'centered' })).toBe('')
    expect(serializeUrlState({ layout: 'fullscreen' })).toBe('layout=fullscreen')
    expect(parseUrlState('?layout=padded').layout).toBe('padded')
    expect(parseUrlState('?c=x').layout).toBeUndefined()
  })

  it('the model opens on the linked layout, falls back on a bad one, and writes changes back', () => {
    const catalog: WorkbenchCatalog = { components: [{ id: 'a', name: 'A', group: 'G', controls: [], render: () => 'a' }] }
    history.replaceState(null, '', '/?layout=padded')
    const m = createModel(catalog, {})
    expect(m.layout()).toBe('padded')
    m.layout.set('fullscreen')
    expect(location.search).toContain('layout=fullscreen')
    m.layout.set('centered')
    expect(location.search).not.toContain('layout=')
    history.replaceState(null, '', '/?layout=nonsense')
    expect(createModel(catalog, {}).layout()).toBe('centered')
  })
})

describe('every role side by side', () => {
  it('reads the verb off a key, case-insensitively', () => {
    expect(verbOf('posts.delete')).toBe('delete')
    expect(verbOf('Delete')).toBe('delete')
    expect(ACTION_VERBS.has('remove')).toBe(true)
    expect(ACTION_VERBS.has('share')).toBe(false)
  })

  it('collects enabled, named, visible actions with their verb', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <button>Delete project</button>
      <button disabled>Delete forever</button>
      <button aria-disabled="true">Remove</button>
      <a href="#">Share</a>
      <div role="button" aria-label="Edit row"></div>
      <input type="submit" value="Save changes" />
      <span aria-hidden="true"><button>Archive</button></span>
      <button>   </button>`
    expect(renderedActions(root)).toEqual([
      { name: 'Delete project', verb: 'delete' },
      { name: 'Share', verb: null },
      { name: 'Edit row', verb: 'edit' },
      { name: 'Save changes', verb: 'save' },
    ])
  })

  it('names who the policy lets take a verb', () => {
    expect(policyFor('delete', DEFAULT_PERMISSION_SETS)).toBe('admin only')
    expect(policyFor('save', DEFAULT_PERMISSION_SETS)).toBe('editor, admin')
    expect(policyFor('delete', DEFAULT_PERMISSION_SETS.filter((r) => r.id !== 'admin'))).toBe('no role')
  })

  it('a component that consulted nothing is unguarded for every role', () => {
    const v = judgeRole(role('viewer'), DEFAULT_PERMISSION_SETS, [], [], [{ name: 'Delete', verb: 'delete' }])
    expect(v.state).toBe('unguarded')
  })

  it('an action rendered although every key for its verb was denied is a violation', () => {
    const v = judgeRole(role('viewer'), DEFAULT_PERMISSION_SETS, ['posts.delete'], ['posts.delete'], [
      { name: 'Delete project', verb: 'delete' },
    ])
    expect(v).toEqual({
      state: 'violation',
      message: `"Delete project" rendered for viewer although can('posts.delete') was denied`,
    })
  })

  it('an action with no check behind it is judged by the role policy', () => {
    const consulted = ['posts.read']
    const actions = [{ name: 'Delete', verb: 'delete' }]
    expect(judgeRole(role('viewer'), DEFAULT_PERMISSION_SETS, consulted, [], actions)).toEqual({
      state: 'violation',
      message: '"Delete" rendered for viewer with no can() check · policy: admin only',
    })
    expect(judgeRole(role('admin'), DEFAULT_PERMISSION_SETS, consulted, [], actions).state).toBe('ok')
  })

  it('a granted check passes, unknown verbs are not judged, and the message says which', () => {
    const granted = judgeRole(role('admin'), DEFAULT_PERMISSION_SETS, ['posts.delete'], [], [
      { name: 'Delete', verb: 'delete' },
    ])
    expect(granted).toEqual({ state: 'ok', message: 'matches policy' })
    const unjudged = judgeRole(role('anonymous'), DEFAULT_PERMISSION_SETS, ['posts.read'], ['posts.read'], [
      { name: 'Share', verb: null },
    ])
    expect(unjudged).toEqual({ state: 'ok', message: 'no action it could be denied rendered' })
  })

  it('previewAs renders each role under its OWN recording, apart from the canvas role', () => {
    const catalog: WorkbenchCatalog = {
      components: [
        {
          id: 'danger',
          name: 'Danger',
          group: 'G',
          controls: [],
          render: (_p, ctx) => (ctx.can('posts.delete') ? h('button', null, 'Delete') : null),
        },
      ],
    }
    const m = createModel(catalog, {})
    const viewer = m.previewAs('viewer')
    const admin = m.previewAs('admin')
    expect(viewer.node).not.toBeNull()
    expect(viewer.recording.denied()).toEqual(['posts.delete'])
    expect(admin.recording.denied()).toEqual([])
    // The canvas's recording saw none of it.
    expect(m.permissions().consulted()).toEqual([])
    // An unknown role falls back to the first, like the canvas does.
    expect(m.previewAs('nobody').recording.consulted()).toEqual(['posts.delete'])
  })

  it('previewAs renders nothing for an empty catalog', () => {
    const m = createModel({ components: [] }, {})
    expect(m.previewAs('admin').node).toBeNull()
  })
})

describe('where each control comes from', () => {
  const controls: WorkbenchControl[] = [
    { key: 'state', label: 'State', type: 'enum', options: ['a', 'b'], default: 'a', source: 'dimension' },
    { key: 'children', label: 'Children', type: 'text', default: 'Hi', source: 'content' },
    { key: 'size', label: 'Size', type: 'number', default: 1, source: 'prop-type', addedAt: 1000 },
    { key: 'on', label: 'On', type: 'bool', default: false },
    { key: 'tint', label: 'Tint', type: 'color', default: '#000', source: 'spec' },
  ]

  it('labels every derived source, and a hand-written control as the catalog', () => {
    const rows = schemaRows(controls, [])
    expect(rows.map((r) => [r.key, r.type, r.control, r.source])).toEqual([
      ['state', 'a | b', 'select', 'rocketstyle dimension'],
      ['children', 'string', 'text', 'content seed'],
      ['size', 'number', 'number', 'prop type'],
      ['on', 'boolean', 'switch', 'catalog'],
      ['tint', 'color', 'color', 'defineComponent'],
    ])
    expect(rows[2]!.addedAt).toBe(1000)
    expect(Object.keys(SOURCE_LABEL)).toEqual(['prop-type', 'dimension', 'content', 'spec'])
  })

  it('a schema field is sourced `schema`, wins over a same-named control, and adds what the controls lack', () => {
    const fields = extractFields(
      z.object({ state: z.enum(['a', 'b', 'c']), loading: z.boolean().optional(), note: z.string() }),
    )
    const rows = schemaRows([controls[0]!, { ...controls[2]!, key: 'note', addedAt: 5 }], fields)
    expect(rows.map((r) => [r.key, r.type, r.control, r.source, r.addedAt])).toEqual([
      ['state', 'a | b | c', 'select', 'schema', undefined],
      ['note', 'string', 'text', 'schema', 5],
      ['loading', 'boolean?', 'switch', 'schema', undefined],
    ])
  })

  it('an enum with no options reads as a bare enum', () => {
    expect(schemaRows([{ key: 'k', label: 'K', type: 'enum', default: '' }], [])[0]!.type).toBe('enum')
    const noMembers = [{ name: 'k', label: 'K', type: 'enum' as const, optional: false }]
    expect(schemaRows([], noMembers)[0]!.type).toBe('enum')
  })

  it('says how long ago a control appeared, coarsely', () => {
    const t = 1_000_000
    expect(addedAgo(t, t + 20_000)).toBe('added just now')
    expect(addedAgo(t, t - 5_000)).toBe('added just now')
    expect(addedAgo(t, t + 2 * 60_000)).toBe('added 2 min ago')
    expect(addedAgo(t, t + 3 * 3_600_000)).toBe('added 3 h ago')
    expect(NEW_FOR_MS).toBe(600_000)
  })
})

describe('the Lens "Fix:" line', () => {
  it("a footgun's fix is its detector's rewrite; a static read gets the live-read rewrite; others none", () => {
    const base = { detail: '', column: 0, suspect: true }
    expect(lensFix({ ...base, kind: 'footgun', fix: 'by={(i) => i.id}' })).toBe('by={(i) => i.id}')
    expect(lensFix({ ...base, kind: 'footgun' })).toBeUndefined()
    expect(lensFix({ ...base, kind: 'static-text' })).toMatch(/read the signal where it is used/)
    expect(lensFix({ ...base, kind: 'reactive', suspect: false })).toBeUndefined()
  })
})
