import { describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { z } from 'zod'
import { defineFeature } from '../define-feature'

const schema = z.object({
  title: z.string().min(3, 'too short'),
  count: z.number(),
  done: z.boolean(),
  role: z.enum(['admin', 'editor', 'viewer']),
  note: z.string().optional(),
})
type Values = z.infer<typeof schema>

const noopFetcher = (async () =>
  new Response('[]', { headers: { 'content-type': 'application/json' } })) as typeof fetch

function makeFeature() {
  return defineFeature<Values>({
    name: `f${Math.floor(performance.now() * 1000)}`,
    api: '/api/x',
    schema,
    fetcher: noopFetcher,
    initialValues: { title: '', count: 0, done: false, role: 'admin', note: '' },
  })
}

/** Mount a component under a QueryClient (feature.useForm needs one). */
function render(cmp: () => unknown) {
  const host = document.createElement('div')
  const client = new QueryClient()
  mount(h(QueryClientProvider, { client }, h(cmp as never, null)), host)
  return host
}

describe('feature.Field', () => {
  it('derives a typed control per schema type', () => {
    const F = makeFeature()
    const host = render(() => {
      const form = F.useForm()
      return h(
        'form',
        null,
        h(F.Field, { form, name: 'title' }),
        h(F.Field, { form, name: 'count' }),
        h(F.Field, { form, name: 'done' }),
        h(F.Field, { form, name: 'role' }),
      )
    })

    expect(host.querySelector('[data-field=title] input')!.getAttribute('type')).toBe('text')
    expect(host.querySelector('[data-field=count] input')!.getAttribute('type')).toBe('number')
    expect(host.querySelector('[data-field=done] input')!.getAttribute('type')).toBe('checkbox')
    expect(host.querySelectorAll('[data-field=role] option')).toHaveLength(3)
  })

  it('marks required from schema optionality, not from a prop', () => {
    const F = makeFeature()
    const host = render(() => {
      const form = F.useForm()
      return h('form', null, h(F.Field, { form, name: 'title' }), h(F.Field, { form, name: 'note' }))
    })
    expect(host.querySelector('[data-field=title] label')!.textContent).toContain('*')
    expect(host.querySelector('[data-field=note] label')!.textContent).not.toContain('*')
  })

  it('associates label→control and gives the error a live-region role', () => {
    const F = makeFeature()
    const host = render(() => {
      const form = F.useForm()
      return h('form', null, h(F.Field, { form, name: 'title' }))
    })
    const label = host.querySelector('[data-field=title] label')!
    const input = host.querySelector('[data-field=title] input')!
    expect(label.getAttribute('for')).toBe(input.getAttribute('id'))
    expect(label.getAttribute('for')).toBeTruthy()
    expect(host.querySelector('[data-field=title] span')!.getAttribute('role')).toBe('alert')
  })

  it('writes through to form state', () => {
    const F = makeFeature()
    let form!: ReturnType<typeof F.useForm>
    const host = render(() => {
      form = F.useForm()
      return h('form', null, h(F.Field, { form, name: 'title' }))
    })
    const input = host.querySelector('[data-field=title] input') as HTMLInputElement
    input.value = 'hello'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(form.values().title).toBe('hello')
  })

  it('shows a validation error only once the field is touched', async () => {
    const F = makeFeature()
    let form!: ReturnType<typeof F.useForm>
    const host = render(() => {
      form = F.useForm()
      return h('form', null, h(F.Field, { form, name: 'title' }))
    })
    const err = host.querySelector('[data-field=title] span')!
    expect(err.textContent).toBe('')

    const input = host.querySelector('[data-field=title] input') as HTMLInputElement
    input.value = 'ab'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(err.textContent).toContain('too short')
  })

  it('accepts per-field overrides — the escape hatch that makes it usable', () => {
    const F = makeFeature()
    const host = render(() => {
      const form = F.useForm()
      return h(
        'form',
        null,
        h(F.Field, {
          form,
          name: 'title',
          label: 'Headline',
          type: 'search',
          placeholder: 'Search…',
          class: 'custom-row',
          inputClass: 'custom-input',
        }),
        h(F.Field, { form, name: 'role', options: ['admin'] }),
      )
    })
    const row = host.querySelector('[data-field=title]')!
    const input = row.querySelector('input')!
    expect(row.getAttribute('class')).toBe('custom-row')
    expect(row.querySelector('label')!.textContent).toContain('Headline')
    expect(input.getAttribute('type')).toBe('search')
    expect(input.getAttribute('placeholder')).toBe('Search…')
    expect(input.getAttribute('class')).toBe('custom-input')
    expect(host.querySelectorAll('[data-field=role] option')).toHaveLength(1)
  })

  it('fails LOUDLY and names the typo instead of rendering an empty row', () => {
    // Pyreon catches a setup throw and routes it to the error handler rather
    // than letting it escape `mount`, so the contract is "loud and named", not
    // "mount throws". A silent empty row would read as a styling problem.
    const F = makeFeature()
    const seen: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      seen.push(args.map(String).join(' '))
    })
    render(() => {
      const form = F.useForm()
      return h('form', null, h(F.Field, { form, name: 'ttile' as never }))
    })
    spy.mockRestore()
    const msg = seen.join('\n')
    expect(msg).toContain('no such field in the schema')
    expect(msg).toContain('ttile')
    expect(msg).toContain('title') // lists the real ones so the fix is obvious
  })
})
