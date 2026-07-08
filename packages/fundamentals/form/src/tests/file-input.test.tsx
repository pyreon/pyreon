import { describe, expect, it } from 'vitest'
import { useForm } from '../use-form'

// P6 — file input support. `register(field, { type: 'file' })` returns a
// value-less props bag (a file input can't be value-controlled) whose onInput
// writes the input's `FileList` (`target.files`) to the field.

function fileEvent(files: File[]): Event {
  // onInput only reads `(e.target as HTMLInputElement).files`.
  return { target: { files } } as unknown as Event
}

describe('useForm — file input (P6)', () => {
  it('register({ type: "file" }) omits value + checked, keeps id/handlers/aria', () => {
    const form = useForm<{ avatar: FileList | null }>({
      initialValues: { avatar: null },
      onSubmit: () => {},
    })
    const reg = form.register('avatar', { type: 'file' })
    expect('value' in reg).toBe(false)
    expect('checked' in reg).toBe(false)
    expect(typeof reg.id).toBe('string')
    expect(typeof reg.onInput).toBe('function')
    expect(typeof reg.onBlur).toBe('function')
    expect('aria-invalid' in reg).toBe(true)
  })

  it('onInput writes the FileList to the field value', () => {
    const form = useForm<{ avatar: File[] | null }>({
      initialValues: { avatar: null },
      onSubmit: () => {},
    })
    const reg = form.register('avatar', { type: 'file' })
    const file = new File(['hi'], 'a.txt', { type: 'text/plain' })
    reg.onInput(fileEvent([file]))
    expect(form.getValues('avatar')).toEqual([file])
    expect(form.getValues('avatar')?.[0]?.name).toBe('a.txt')
  })

  it('carries multiple files', () => {
    const form = useForm<{ docs: File[] | null }>({
      initialValues: { docs: null },
      onSubmit: () => {},
    })
    const reg = form.register('docs', { type: 'file' })
    const a = new File(['a'], 'a.txt')
    const b = new File(['b'], 'b.txt')
    reg.onInput(fileEvent([a, b]))
    expect(form.getValues('docs')).toHaveLength(2)
  })

  it('the file value reaches onSubmit', async () => {
    let submitted: { avatar: File[] | null } | undefined
    const form = useForm<{ avatar: File[] | null }>({
      initialValues: { avatar: null },
      onSubmit: (v) => {
        submitted = v
      },
    })
    const file = new File(['x'], 'x.png')
    form.register('avatar', { type: 'file' }).onInput(fileEvent([file]))
    await form.handleSubmit()
    expect(submitted?.avatar).toEqual([file])
  })

  it('register is memoized per field:type (stable identity)', () => {
    const form = useForm<{ avatar: File[] | null }>({
      initialValues: { avatar: null },
      onSubmit: () => {},
    })
    expect(form.register('avatar', { type: 'file' })).toBe(
      form.register('avatar', { type: 'file' }),
    )
  })
})
