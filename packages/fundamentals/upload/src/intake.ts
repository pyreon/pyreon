import { getCurrentScope, signal } from '@pyreon/reactivity'
import { useFileDrop } from './drop'
import { useFilePicker } from './picker'
import type { FileRejection, FileRule } from './types'
import { validateFiles } from './validate'

/** A file that was not taken, with every reason. */
export interface RejectedFile {
  file: File
  rejections: readonly FileRejection[]
}

/** What the headless components share. Reactive options are read when they are used, so getters stay live. */
export interface IntakeOptions {
  accept?: readonly string[] | undefined
  multiple?: boolean | undefined
  rules?: FileRule | undefined
  disabled?: boolean | undefined
  directories?: boolean | undefined
  paste?: boolean | undefined
  onFiles?: ((files: File[]) => void) | undefined
  onReject?: ((rejected: RejectedFile[]) => void) | undefined
}

export interface Intake {
  rejections(): readonly RejectedFile[]
  /** The sentence the live region announces: what was taken and what was not, and why. */
  announcement(): string
  clearRejections(): void
  /** Take files from anywhere (a drop, a pick, a paste, your own code): validate, then report. */
  receive(files: File[]): Promise<void>
  drop: ReturnType<typeof useFileDrop>
  picker: ReturnType<typeof useFilePicker>
  /** Called after files were taken or refused: return focus to the control. */
  afterIntake: { current: (() => void) | null }
}

function safely(fn: () => void): void {
  try {
    fn()
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.error('[Pyreon] upload: a callback threw', error)
    }
  }
}

/** The sentence for the live region. */
export function describeIntake(taken: number, rejected: readonly RejectedFile[]): string {
  const parts: string[] = []

  if (taken > 0) parts.push(taken === 1 ? '1 file added.' : `${taken} files added.`)
  if (rejected.length > 0) {
    const detail = rejected.map((r) => `${r.file.name}: ${r.rejections.map((x) => x.message).join(' ')}`).join(' ')

    parts.push(`${rejected.length === 1 ? '1 file was' : `${rejected.length} files were`} not accepted. ${detail}`)
  }

  return parts.join(' ')
}

/**
 * The shared intake of `<FileDrop>` and `<FilePicker>`: every way files arrive (drop, pick, paste) goes through `receive`, which
 * applies the rules (`accept` is case-insensitive, `multiple`, size, count, `rules.sniff`, `rules.image`), keeps the reasons for
 * the files it refused, announces the outcome, and hands the accepted files on.
 */
export function useIntake(options: IntakeOptions): Intake {
  const rejections = signal<readonly RejectedFile[]>([])
  const announcement = signal('')
  const afterIntake: Intake['afterIntake'] = { current: null }
  let generation = 0

  let disposed = false

  getCurrentScope()?.add(() => {
    disposed = true
  })

  async function receive(incoming: File[]): Promise<void> {
    if (options.disabled === true || incoming.length === 0 || disposed) return
    const mine = ++generation
    const rules: FileRule = { ...options.rules, ...(options.accept === undefined ? {} : { accept: options.accept }) }
    const taken: File[] = []
    const refused: RejectedFile[] = []
    let verdicts: FileRejection[][]

    try {
      verdicts = await validateFiles(incoming, { ...rules, ...(options.multiple === false ? { maxFiles: 1 } : {}) })
    } catch (error) {
      // Rules that cannot be applied (a size such as "huge") are the app's mistake: say so, take nothing.
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] upload: the rules could not be applied to the dropped files', error)
      }
      if (!disposed && mine === generation) announcement.set('The files could not be checked.')

      return
    }
    if (disposed) return
    incoming.forEach((file, i) => {
      const found = verdicts[i] ?? []

      if (found.length > 0) refused.push({ file, rejections: found })
      else taken.push(file)
    })
    // Every drop hands its accepted files on; the reasons and the announcement are those of the latest one.
    if (mine === generation) {
      rejections.set(refused)
      announcement.set(describeIntake(taken.length, refused))
    }
    safely(() => {
      if (refused.length > 0) options.onReject?.(refused)
      if (taken.length > 0) options.onFiles?.(taken)
    })
    if (mine === generation) afterIntake.current?.()
  }

  const drop = useFileDrop({
    get disabled() {
      return options.disabled
    },
    get accept() {
      return options.accept
    },
    get multiple() {
      return options.multiple
    },
    filter: false,
    get directories() {
      return options.directories
    },
    get paste() {
      return options.paste
    },
    onDrop: (files: File[]) => void receive(files),
  } as never)
  const picker = useFilePicker({
    get multiple() {
      return options.multiple !== false
    },
    get accept() {
      return options.accept
    },
    onPick: (files: File[]) => void receive(files),
  } as never)

  return {
    rejections: () => rejections(),
    announcement: () => announcement(),
    clearRejections: () => {
      rejections.set([])
      announcement.set('')
    },
    receive,
    drop,
    picker,
    afterIntake,
  }
}
