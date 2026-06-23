import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _reset, _setDefaultDuration, _toasts, toast } from '../toast'

function at(i: number) {
  const t = _toasts()[i]
  if (!t) throw new Error(`no toast at ${i}`)
  return t
}

beforeEach(() => _reset())
afterEach(() => _reset())

describe('Toaster duration default (_setDefaultDuration)', () => {
  it('a toast without an explicit duration uses the app default (4000)', () => {
    toast('x')
    expect(at(0).duration).toBe(4000)
  })

  it('`<Toaster duration>` changes the default for toasts that omit duration', () => {
    _setDefaultDuration(1000)
    toast('x')
    expect(at(0).duration).toBe(1000)
  })

  it("an explicit per-toast duration overrides the Toaster's default", () => {
    _setDefaultDuration(1000)
    toast('x', { duration: 250 })
    expect(at(0).duration).toBe(250)
  })

  it('_reset restores the default to 4000 (no leak across tests)', () => {
    _setDefaultDuration(99)
    _reset()
    toast('x')
    expect(at(0).duration).toBe(4000)
  })
})

describe('description + icon', () => {
  it('stores a description', () => {
    toast('Uploaded', { description: '3 files' })
    expect(at(0).description).toBe('3 files')
  })

  it('stores a custom icon', () => {
    const icon = { type: 'svg', props: {}, children: [], key: null }
    toast('With icon', { icon })
    expect(at(0).icon).toBe(icon)
  })

  it('description/icon are undefined when not provided', () => {
    toast('plain')
    expect(at(0).description).toBeUndefined()
    expect(at(0).icon).toBeUndefined()
  })

  it('toast.update can change the description', () => {
    const id = toast('Loading', { duration: 0, description: 'starting' })
    toast.update(id, { description: 'almost done' })
    expect(at(0).description).toBe('almost done')
  })

  it('toast.update preserves description + icon when not in the update', () => {
    const icon = { type: 'svg', props: {}, children: [], key: null }
    const id = toast('Loading', { duration: 0, description: 'keep me', icon })
    toast.update(id, { message: 'Done', type: 'success' })
    expect(at(0).message).toBe('Done')
    expect(at(0).description).toBe('keep me')
    expect(at(0).icon).toBe(icon)
  })
})
