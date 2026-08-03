/**
 * Component identity — and the collision it exists to stop.
 *
 * The bug: the graph keyed components by NAME (`byName.set(ci.name, ci)`), so a
 * workspace where two packages each export a `Button` kept ONE of them and
 * dropped the other with no error and no warning. Every test in this file is
 * either that scenario or a guard on the fix not changing single-package
 * behaviour.
 */
import { describe, expect, it } from 'vitest'
import { createCatalogGraph } from '../graph'
import {
  ambiguousComponentMessage,
  componentKey,
  resolveComponent,
} from '../identity'
import type { ComponentIntelligence } from '../types'

const component = (name: string, project?: string): ComponentIntelligence => ({
  name,
  controls: [],
  axes: [],
  scenarios: [],
  tags: [],
  ...(project !== undefined ? { project } : {}),
})

describe('componentKey', () => {
  it('is the bare name outside a monorepo — single-package keys are unchanged', () => {
    expect(componentKey(component('Button'))).toBe('Button')
  })

  it('qualifies with the project inside one', () => {
    expect(componentKey(component('Button', 'Core'))).toBe('Core/Button')
  })
})

describe('the collision this exists to stop', () => {
  it('KEEPS both when two projects export the same name', () => {
    // Pre-fix this graph held one component. Silently.
    const graph = createCatalogGraph([
      component('Button', 'Core'),
      component('Button', 'Admin'),
    ])
    expect(graph.size()).toBe(2)
    expect(graph.list().map(componentKey)).toEqual(['Core/Button', 'Admin/Button'])
  })

  it('still REPLACES a genuine duplicate — same project, same name', () => {
    // Not the same thing: one root cannot export two `Button`s, so a repeat is
    // a re-registration (a plugin refining a component), and replacing is right.
    const graph = createCatalogGraph()
    graph.add({ ...component('Button', 'Core'), tags: ['old'] })
    graph.add({ ...component('Button', 'Core'), tags: ['new'] })
    expect(graph.size()).toBe(1)
    expect(graph.list()[0]!.tags).toEqual(['new'])
  })

  it('resolves each by its key', () => {
    const graph = createCatalogGraph([
      component('Button', 'Core'),
      component('Button', 'Admin'),
    ])
    expect(graph.get('Core/Button')?.project).toBe('Core')
    expect(graph.get('Admin/Button')?.project).toBe('Admin')
  })

  it('refuses an AMBIGUOUS bare name instead of guessing', () => {
    // Returning the first match is how the original bug stayed invisible: the
    // caller gets a plausible answer and no reason to doubt it.
    const graph = createCatalogGraph([
      component('Button', 'Core'),
      component('Button', 'Admin'),
    ])
    expect(graph.get('Button')).toBeUndefined()
  })
})

describe('resolveComponent', () => {
  const all = [component('Button', 'Core'), component('Button', 'Admin'), component('Chip', 'Core')]

  it('resolves an exact key', () => {
    expect(resolveComponent(all, 'Admin/Button').found?.project).toBe('Admin')
  })

  it('resolves an UNAMBIGUOUS bare name — existing callers keep working', () => {
    expect(resolveComponent(all, 'Chip').found?.name).toBe('Chip')
  })

  it('reports the candidates for an ambiguous name', () => {
    const result = resolveComponent(all, 'Button')
    expect(result.found).toBeUndefined()
    expect('ambiguous' in result && result.ambiguous).toEqual(['Core/Button', 'Admin/Button'])
  })

  it('distinguishes "not found" from "ambiguous" — both have no result', () => {
    const result = resolveComponent(all, 'Nope')
    expect(result.found).toBeUndefined()
    expect('ambiguous' in result && result.ambiguous).toEqual([])
  })

  it('a bare name never shadows an exact key match', () => {
    // A project literally named `Button` would otherwise let `Button/Button`
    // lose to the bare-name pass.
    const tricky = [component('Button', 'Button'), component('Button')]
    expect(resolveComponent(tricky, 'Button/Button').found?.project).toBe('Button')
    expect(resolveComponent(tricky, 'Button').found?.project).toBeUndefined()
  })
})

describe('ambiguousComponentMessage', () => {
  it('names the candidates, which are what the caller should retry with', () => {
    const message = ambiguousComponentMessage('Button', ['Core/Button', 'Admin/Button'])
    expect(message).toContain('Core/Button')
    expect(message).toContain('Admin/Button')
    expect(message).toContain('2 components')
  })
})
