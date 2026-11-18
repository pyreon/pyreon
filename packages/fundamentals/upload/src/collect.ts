interface FsEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?(ok: (f: File) => void, fail: (e: unknown) => void): void
  createReader?(): { readEntries(ok: (e: FsEntry[]) => void, fail: (e: unknown) => void): void }
}

const readAll = (reader: NonNullable<ReturnType<NonNullable<FsEntry['createReader']>>>): Promise<FsEntry[]> =>
  new Promise((resolve, reject) => {
    const all: FsEntry[] = []
    const next = (): void => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all)
        else {
          all.push(...batch)
          next()
        }
      }, reject)
    }

    next()
  })

async function walk(entry: FsEntry, out: File[], depth: number): Promise<void> {
  if (entry.isFile && entry.file !== undefined) {
    const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail))

    out.push(file)
  } else if (entry.isDirectory && entry.createReader !== undefined && depth < 64) {
    for (const child of await readAll(entry.createReader())) await walk(child, out, depth + 1)
  }
}

/**
 * The files of a drop (`event.dataTransfer`), with folders read and flattened when the browser supports
 * `webkitGetAsEntry`, otherwise the plain `files` list (a dropped folder is then not readable and is skipped by the browser).
 * The drop's items are only valid during the event, so this reads them synchronously before its first `await`: call it from the
 * drop handler.
 */
export async function collectDropped(data: DataTransfer | null | undefined, options?: { directories?: boolean }): Promise<File[]> {
  if (data === null || data === undefined) return []
  const items = data.items === undefined ? [] : Array.from(data.items).filter((i) => i.kind === 'file')
  const entries = options?.directories === false ? [] : items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? (i.webkitGetAsEntry() as FsEntry | null) : null))
  const direct = items.map((i) => i.getAsFile()).filter((f): f is File => f !== null)
  const plain = Array.from(data.files ?? [])

  if (!entries.some((e) => e !== null)) return direct.length > 0 ? direct : plain
  const out: File[] = []

  for (const entry of entries) if (entry !== null) await walk(entry, out, 0)

  return out
}

/** The files on the clipboard (a pasted image, or files copied in a file manager). Text is not touched. */
export function collectPasted(data: DataTransfer | null | undefined): File[] {
  if (data === null || data === undefined) return []
  const fromItems = data.items === undefined ? [] : Array.from(data.items).filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => f !== null)

  return fromItems.length > 0 ? fromItems : Array.from(data.files ?? [])
}
