import { effect } from '@pyreon/reactivity'
import { validateFile } from './validate'
import type { Uploader } from './uploader'
import type { FileRule } from './types'

/** The part of an `@pyreon/form` field (`form.fields.avatar`) the adapter uses. Structural: this package does not import `@pyreon/form`. */
export interface FileFieldLike {
  value: () => readonly File[] | FileList | null | undefined
  setValue(value: never): void
  setTouched(): void
  error: { set(message: string | undefined): void }
}

export interface FileFieldOptions {
  /** Mark the field touched when files are added (default true), so the form shows its errors. */
  touchOnAdd?: boolean
}

const filesOf = (value: readonly File[] | FileList | null | undefined): File[] => (value === null || value === undefined ? [] : Array.from(value))

/**
 * Make an uploader's files the value of a form field. The field value is the list of accepted `File`s (rejected and cancelled
 * ones are not in it); when files are added the field is touched; the reason a file was rejected becomes the field's error until
 * the form validates again; and when the form resets the field (its value goes back to empty) the queue is cleared, so a form
 * reset empties the upload list too. Returns a function that stops the binding.
 *
 * @example typeof bindFileField // => 'function'
 */
export function bindFileField(uploader: Uploader, field: FileFieldLike, options: FileFieldOptions = {}): () => void {
  let seen = 0
  let writing = false
  const stop = effect(() => {
    const list = uploader.files()
    const accepted = list.filter((f) => {
      const s = f.status()

      return s !== 'rejected' && s !== 'cancelled'
    })
    const rejected = list.find((f) => f.status() === 'rejected')

    writing = true
    field.setValue(accepted.map((f) => f.file as File) as never)
    writing = false
    field.error.set(rejected?.rejections()[0]?.message)
    if (options.touchOnAdd !== false && list.length > seen) field.setTouched()
    seen = list.length
  })
  const reset = effect(() => {
    const value = filesOf(field.value())

    if (!writing && value.length === 0 && uploader.files().some((f) => f.status() !== 'rejected')) uploader.clear()
  })

  return () => {
    stop.dispose()
    reset.dispose()
  }
}

export interface FileValidatorOptions {
  /** The field is required: at least one file. A string is the message. */
  required?: boolean | string
  /** Rules each file must pass (`maxSize`, `accept`, `maxFiles`, ...). */
  rules?: FileRule
}

/**
 * A validator for `useForm({ validators: { avatar: fileValidator({ required: true, rules }) } })`: the required-file rule, then
 * each file against the rules (the first reason is the error). It returns a Promise only when a rule has to look inside the
 * file.
 *
 * @example fileValidator({ required: 'Choose a file' })([]) // => 'Choose a file'
 */
export function fileValidator(options: FileValidatorOptions = {}): (value: readonly File[] | FileList | null | undefined) => string | undefined | Promise<string | undefined> {
  return (value) => {
    const files = filesOf(value)

    if (files.length === 0) return options.required === undefined || options.required === false ? undefined : typeof options.required === 'string' ? options.required : 'Choose a file.'
    const rules = options.rules
    const max = rules?.maxFiles

    if (max !== undefined && files.length > max) return `At most ${max} ${max === 1 ? 'file is' : 'files are'} allowed.`
    if (rules === undefined) return undefined
    const verdicts = files.map((f) => validateFile(f, rules))

    if (verdicts.every((v) => !(v instanceof Promise))) return (verdicts as { message: string }[][]).find((v) => v.length > 0)?.[0]?.message

    return Promise.all(verdicts).then((all) => all.find((v) => v.length > 0)?.[0]?.message)
  }
}
