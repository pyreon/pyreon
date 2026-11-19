/** The part of `localStorage` (or `@pyreon/storage`, or any key-value store) that resume state needs. */
export interface ResumeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Saves what a resumable transport needs to continue an upload after a failure, a pause or a page reload. */
export interface ResumeStore {
  /** The saved state of this file, or `undefined` (none, expired, or unreadable). */
  load(file: { name: string; size: number; type: string; file: Blob }): unknown
  save(file: { name: string; size: number; type: string; file: Blob }, state: unknown): void
  clear(file: { name: string; size: number; type: string; file: Blob }): void
}

export interface ResumeStoreOptions {
  /** Key prefix. Default `pyreon-upload:`. */
  prefix?: string
  /** Milliseconds a saved state stays valid (servers forget unfinished uploads). Default seven days. */
  maxAge?: number
  now?: () => number
}

/**
 * What identifies a file across page loads: name, size, type and last-modified time. Two different files with all four equal
 * would share a state, which is why the saved state is also checked by the server (an unknown upload id starts over).
 *
 * @example fingerprint({ name: 'a.mp4', size: 10, type: 'video/mp4', file: new File([], 'a.mp4', { lastModified: 5 }) }) // => 'a.mp4|10|video/mp4|5'
 */
export function fingerprint(file: { name: string; size: number; type: string; file: Blob }): string {
  return `${file.name}|${file.size}|${file.type}|${(file.file as File).lastModified ?? ''}`
}

/**
 * A resume store on a key-value storage such as `localStorage` (or an `@pyreon/storage` adapter). Entries expire after `maxAge`;
 * a corrupt entry is removed; a storage that throws (private mode, quota) makes saving a no-op rather than an error, because a
 * missing resume state only costs a restart.
 *
 * @example createResumeStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} }).load({ name: 'a', size: 1, type: '', file: new Blob(['a']) }) // => undefined
 */
export function createResumeStore(storage: ResumeStorage, options: ResumeStoreOptions = {}): ResumeStore {
  const prefix = options.prefix ?? 'pyreon-upload:'
  const maxAge = options.maxAge ?? 7 * 24 * 3600 * 1000
  const now = options.now ?? (() => Date.now())
  const key = (file: Parameters<ResumeStore['load']>[0]): string => `${prefix}${fingerprint(file)}`
  const attempt = (fn: () => void): void => {
    try {
      fn()
    } catch {
      // A storage that throws only costs a restart.
    }
  }

  return {
    load(file) {
      let raw: string | null = null

      attempt(() => {
        raw = storage.getItem(key(file))
      })
      if (raw === null) return undefined
      try {
        const saved = JSON.parse(raw) as { at?: unknown; state?: unknown }

        if (typeof saved.at === 'number' && now() - saved.at <= maxAge && saved.state !== undefined) return saved.state
      } catch {
        // fall through: a corrupt entry is removed
      }
      attempt(() => storage.removeItem(key(file)))

      return undefined
    },
    save(file, state) {
      attempt(() => storage.setItem(key(file), JSON.stringify({ at: now(), state })))
    },
    clear(file) {
      attempt(() => storage.removeItem(key(file)))
    },
  }
}
