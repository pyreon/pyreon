/**
 * Image registry — collapse N hand-written image imports into one glob.
 *
 * The icon-set / logo-list / partner-grid pattern is everywhere: you want
 * to render the right image from a Record<name, descriptor> built at build
 * time. Today you write 13 imports + an object literal that maps names to
 * `.src` strings (losing every other field of the descriptor along the way).
 *
 * `createImageRegistry` takes Vite's `import.meta.glob` output and returns
 * a typed accessor that resolves a name to its full descriptor — width,
 * height, srcset, placeholder, formats. The descriptor flows through to
 * `<Image>` unchanged, so the icon-set component composes with the rest of
 * the optimization story for free.
 *
 * @example
 * ```ts
 * // src/components/PartnerLogos.tsx
 * import { Image, createImageRegistry } from '@pyreon/zero'
 *
 * const logos = createImageRegistry(
 *   import.meta.glob('../assets/partners/*.png', { eager: true })
 * )
 *
 * function PartnerLogos({ partners }: { partners: string[] }) {
 *   return partners.map((name) => (
 *     <Image src={logos(name)} alt={name + ' logo'} />
 *   ))
 * }
 * ```
 *
 * @example
 * ```ts
 * // With named subset typing — the registry tracks which keys exist
 * const icons = createImageRegistry({
 *   'check.png': checkDesc,
 *   'close.png': closeDesc,
 * })
 * icons('check.png')  // ✓ ok
 * icons('typo.png')   // ✗ type error
 * ```
 */
import type { ProcessedImage } from './image-plugin'

/**
 * Vite's `import.meta.glob` returns one of two shapes depending on the
 * `eager` flag and the file's export style:
 *   - `Record<string, T>` for eager imports of a default-export module
 *   - `Record<string, () => Promise<T>>` for lazy imports
 *   - `Record<string, { default: T }>` for some eager + dynamic shapes
 *
 * The registry normalizes all three at construction time. Lazy imports
 * aren't supported (a registry that returns Promises isn't synchronously
 * usable in JSX); pass `{ eager: true }` to `import.meta.glob`.
 */
type GlobEntry = ProcessedImage | { default: ProcessedImage }
type GlobRecord = Record<string, GlobEntry>

/**
 * Strategy for mapping the glob's path-shaped keys to short lookup names.
 *
 * Vite emits keys like `'../assets/partners/strv.png'`. The registry's
 * caller wants to look up by `'strv'` or `'strv.png'` — the basename, not
 * the full path. By default the registry stores both the full key AND
 * the basename (with + without extension) so all three lookup styles
 * work; pass `keyBy: 'path'` to disable the basename aliases when you
 * have collisions (e.g. `logos/strv.png` and `icons/strv.png`).
 */
export type ImageRegistryKeyStrategy = 'auto' | 'path'

export interface ImageRegistryOptions {
  /**
   * How to derive lookup keys from the glob's path-shaped keys. Default
   * `'auto'` — registers each entry under its full path, its basename
   * with extension, AND its basename without extension. `'path'`
   * registers only the full path (needed when you have basename
   * collisions across directories).
   */
  keyBy?: ImageRegistryKeyStrategy
}

/**
 * A typed image-registry accessor. Call it with a key to resolve the
 * descriptor; pass a fallback as the second argument to suppress the
 * dev-mode warning when a key is missing.
 */
export interface ImageRegistry<K extends string = string> {
  /**
   * Resolve `key` to a descriptor. Throws in dev with a list of available
   * keys when `key` is missing AND no `fallback` is provided; returns the
   * `fallback` (or `null`) at the same call shape in production.
   */
  (key: K, fallback?: ProcessedImage | null): ProcessedImage
  /** Returns true if a key resolves to a descriptor. */
  has(key: string): boolean
  /** All registered keys (for debugging / iteration). */
  keys(): K[]
}

function unwrap(entry: GlobEntry): ProcessedImage {
  if (entry && typeof entry === 'object' && 'default' in entry) {
    return (entry as { default: ProcessedImage }).default
  }
  return entry as ProcessedImage
}

function basenameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash === -1 ? path : path.slice(slash + 1)
}

function withoutExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

/**
 * Build a typed image-registry accessor from an `import.meta.glob` result
 * (or any `Record<string, ProcessedImage | { default: ProcessedImage }>`).
 *
 * The accessor preserves the FULL descriptor for every entry — so
 * `<Image src={registry('logo')} />` gets `width`, `height`, `srcset`,
 * `placeholder`, and `formats` end-to-end.
 *
 * Missing-key behavior:
 * - In dev, throws an error naming the missing key + listing the
 *   available ones (the #1 debugging cost we'd otherwise eat).
 * - In production, returns the `fallback` if supplied, else throws.
 */
export function createImageRegistry<K extends string = string>(
  entries: GlobRecord | Record<K, GlobEntry>,
  options: ImageRegistryOptions = {},
): ImageRegistry<K> {
  const keyBy = options.keyBy ?? 'auto'
  const map = new Map<string, ProcessedImage>()
  for (const [path, entry] of Object.entries(entries)) {
    const desc = unwrap(entry)
    map.set(path, desc)
    if (keyBy === 'auto') {
      const base = basenameOf(path)
      // basename-with-extension and basename-without-extension alias the
      // full path; later entries don't clobber existing aliases (first
      // glob wins), so `keyBy: 'path'` is the escape hatch for clashes.
      if (!map.has(base)) map.set(base, desc)
      const stem = withoutExt(base)
      if (!map.has(stem)) map.set(stem, desc)
    }
  }

  const accessor = ((key: K, fallback?: ProcessedImage | null): ProcessedImage => {
    const hit = map.get(key)
    if (hit) return hit
    if (fallback !== undefined) return fallback as ProcessedImage
    const known = [...map.keys()].slice(0, 10).join(', ')
    throw new Error(
      `[@pyreon/zero] createImageRegistry: no image registered for '${key}'.` +
        ` Registered keys: [${known}${map.size > 10 ? ', …' : ''}]`,
    )
  }) as ImageRegistry<K>

  accessor.has = (k) => map.has(k)
  accessor.keys = () => [...map.keys()] as K[]

  return accessor
}
