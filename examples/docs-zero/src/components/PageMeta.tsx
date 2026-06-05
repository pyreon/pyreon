interface PageMetaProps {
  slug: string
}

// Page footer with the edit-on-GitHub link + the last-updated
// timestamp. Mirrors the VitePress footer (`lastUpdated: true` +
// `editLink` config).
//
// The slug maps to its source `.md` path under
// `examples/docs-zero/src/content/docs/`. The last-updated timestamp
// is read from a generated `__last_updated.json` map written at build
// time by the Vite plugin (see `vite.config.ts:lastUpdatedPlugin`).
// In dev (no plugin output yet) the timestamp falls back to "today".
export function PageMeta(props: PageMetaProps) {
  const path = props.slug === '' ? 'index' : props.slug
  const sourcePath = `examples/docs-zero/src/content/docs/${path}.md`
  const editUrl = `https://github.com/pyreon/pyreon/edit/main/${sourcePath}`
  const lastUpdated = lookupLastUpdated(path)

  return (
    <footer class="docs-meta">
      <a href={editUrl} rel="noopener noreferrer">
        Edit this page on GitHub →
      </a>
      {lastUpdated ? (
        <span>
          Last updated:{' '}
          <time {...{ datetime: lastUpdated.iso }}>{lastUpdated.label}</time>
        </span>
      ) : null}
    </footer>
  )
}

interface LastUpdatedEntry {
  iso: string
  label: string
}

// Module-level cache so we only touch the registry once per session.
let _registry: Record<string, string> | null = null

function loadRegistry(): Record<string, string> {
  if (_registry) return _registry
  // The build emits __last_updated.json as a virtual asset; the eager
  // import is JSON so it tree-shakes to a string in the prod bundle.
  try {
    // Lazy require — the generated file may not exist in dev.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = (globalThis as { __PYREON_DOCS_LAST_UPDATED__?: Record<string, string> })
      .__PYREON_DOCS_LAST_UPDATED__
    if (data) {
      _registry = data
      return data
    }
  } catch {
    // fall through
  }
  _registry = {}
  return _registry
}

function lookupLastUpdated(slug: string): LastUpdatedEntry | null {
  const registry = loadRegistry()
  const iso = registry[slug]
  if (!iso) return null
  try {
    const d = new Date(iso)
    return {
      iso,
      label: d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    }
  } catch {
    return null
  }
}
