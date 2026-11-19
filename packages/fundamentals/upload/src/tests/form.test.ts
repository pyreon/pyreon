import { useForm } from '@pyreon/form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploader } from '../index'
import { bindFileField, fileValidator } from '../form'
import { fakeTransport, file, flush } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(rules = {}) {
  const t = fakeTransport()
  const uploader = createUploader({ transport: t.transport, rules, autoStart: false })
  const form = useForm<{ avatar: File[]; name: string }>({
    initialValues: { avatar: [], name: '' },
    validators: { avatar: fileValidator({ required: 'Choose a photo', rules }) },
    onSubmit: () => {},
  })
  const stop = bindFileField(uploader, form.fields.avatar as never)

  return { uploader, form, stop }
}

describe('files as a form field', () => {
  it('the field value is the accepted files; adding touches the field and makes it dirty', () => {
    const { uploader, form, stop } = setup()
    const [a] = uploader.add([file('a.png')])

    expect(form.fields.avatar.value()).toEqual([a!.file])
    expect(form.fields.avatar.touched()).toBe(true)
    expect(form.fields.avatar.dirty()).toBe(true)
    uploader.remove(a!.id)
    expect(form.fields.avatar.value()).toEqual([])
    stop()
    uploader.dispose()
  })

  it('the required rule is the form\'s: empty fails with the message, a file passes', async () => {
    const { uploader, form, stop } = setup()

    expect(await form.validate()).toBe(false)
    expect(form.fields.avatar.error()).toBe('Choose a photo')
    uploader.add([file('a.png')])
    expect(await form.validate()).toBe(true)
    expect(form.fields.avatar.error()).toBeUndefined()
    stop()
    uploader.dispose()
  })

  it('a rejected file becomes the field error and stays out of the value; the form validates on submit', async () => {
    const { uploader, form, stop } = setup({ maxSize: 10 })

    uploader.add([file('big.png', 100)])
    expect(form.fields.avatar.value()).toEqual([])
    expect(form.fields.avatar.error()).toBe('The file is 100 B; the limit is 10 B.')
    expect(await form.validate()).toBe(false)
    stop()
    uploader.dispose()
  })

  it('files that break the rules fail the form validator with the first reason', async () => {
    const v = fileValidator({ rules: { maxSize: 10, accept: ['image/*'] } })

    expect(await v([file('a.txt', 100)])).toBe('The file is 100 B; the limit is 10 B.')
    expect(v([])).toBeUndefined()
    expect(v(null)).toBeUndefined()
    expect(fileValidator({ required: true })([])).toBe('Choose a file.')
    expect(fileValidator({ required: false })([])).toBeUndefined()
    expect(fileValidator({ rules: { maxFiles: 1 } })([file('a'), file('b')])).toBe('At most 1 file is allowed.')
    expect(await fileValidator({ rules: { custom: () => 'nope' } })([file('a')])).toBe('nope')
  })

  it('resetting the form empties the queue, and the field goes back to untouched and clean', () => {
    const { uploader, form, stop } = setup()

    uploader.add([file('a.png'), file('b.png')])
    expect(uploader.files()).toHaveLength(2)
    form.reset()
    expect(uploader.files()).toHaveLength(0)
    expect(form.fields.avatar.value()).toEqual([])
    expect(form.fields.avatar.dirty()).toBe(false)
    expect(form.fields.avatar.touched()).toBe(false)
    stop()
    uploader.dispose()
  })

  it('stop() unbinds: later changes no longer reach the field', async () => {
    const { uploader, form, stop } = setup()

    stop()
    uploader.add([file('a.png')])
    await flush()
    expect(form.fields.avatar.value()).toEqual([])
    uploader.dispose()
  })
})
