import Link from 'next/link'

const features = [
  {
    icon: '⚡',
    title: 'Fine-Grained Signals',
    description:
      'Only the exact DOM nodes that depend on a changed signal update — no component re-renders, no VDOM diffing.',
  },
  {
    icon: '🪶',
    title: '~6 kB Gzipped',
    description:
      'Core + runtime-dom weighs under 6 kB gzipped. React DOM is ~42 kB.',
  },
  {
    icon: '🔄',
    title: 'Automatic Tracking',
    description:
      'Dependencies are tracked at runtime — no dependency arrays, no useCallback, no useMemo boilerplate.',
  },
  {
    icon: '🚀',
    title: 'SSR + Hydration',
    description:
      'renderToString and renderToStream on the server. Selective walk-and-claim hydration on the client.',
  },
  {
    icon: '📦',
    title: 'JSX Native',
    description:
      'Full JSX support with jsxImportSource. Works with TypeScript, Vite, and .nova single-file components.',
  },
  {
    icon: '🔀',
    title: 'React Compat',
    description:
      '@pyreon/react-compat provides React-compatible APIs so you can migrate one file at a time.',
  },
]

const sections = [
  { href: '/docs/reactivity', title: 'Reactivity', desc: 'signal, computed, effect, batch' },
  { href: '/docs/components', title: 'Components', desc: 'JSX, h(), Fragment, props' },
  { href: '/docs/lifecycle', title: 'Lifecycle', desc: 'onMount, onUnmount, onUpdate' },
  { href: '/docs/router', title: 'Router', desc: 'hash, history, guards, lazy routes' },
  { href: '/docs/ssr', title: 'SSR', desc: 'renderToString, hydrateRoot' },
  { href: '/docs/migration-react', title: 'Migrate from React', desc: 'step-by-step guide' },
]

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-fd-border px-6 py-4">
        <span className="flex items-center gap-2 font-bold text-lg">
          <span className="text-indigo-500">◆</span>
          Nova
        </span>
        <div className="flex items-center gap-4 text-sm text-fd-muted-foreground">
          <Link href="/docs" className="hover:text-fd-foreground transition-colors">
            Docs
          </Link>
          <a
            href="https://github.com/nova-framework/nova"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fd-foreground transition-colors"
          >
            GitHub ↗
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center px-6 py-24 text-center">
        <div className="mb-4 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400">
          v0.1.0 — fine-grained reactivity
        </div>

        <h1 className="mb-6 max-w-2xl text-5xl font-bold tracking-tight text-fd-foreground sm:text-6xl">
          Build UIs with{' '}
          <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
            surgical precision
          </span>
        </h1>

        <p className="mb-10 max-w-xl text-lg text-fd-muted-foreground">
          Nova is a fine-grained reactivity framework. Signals update only the exact DOM
          nodes that changed — no virtual DOM diffing, no component re-renders, no stale
          closures.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600 transition-colors"
          >
            Get Started →
          </Link>
          <Link
            href="/docs/migration-react"
            className="rounded-lg border border-fd-border px-6 py-2.5 text-sm font-semibold text-fd-foreground hover:bg-fd-accent transition-colors"
          >
            Migrate from React
          </Link>
        </div>
      </section>

      {/* Install */}
      <section className="flex justify-center px-6 pb-16">
        <div className="w-full max-w-lg rounded-xl border border-fd-border bg-fd-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-fd-border bg-fd-secondary px-4 py-2">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
            </div>
            <span className="ml-2 text-xs text-fd-muted-foreground font-mono">Terminal</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm font-mono">
            <code>
              <span className="text-fd-muted-foreground">$ </span>
              <span className="text-green-400">bun</span>
              <span className="text-fd-foreground"> add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom</span>
            </code>
          </pre>
        </div>
      </section>

      {/* Hello World */}
      <section className="flex flex-col items-center px-6 pb-20">
        <h2 className="mb-2 text-2xl font-bold text-fd-foreground">Hello, Nova</h2>
        <p className="mb-8 text-fd-muted-foreground">
          A reactive counter in 12 lines. The DOM updates surgically — only the{' '}
          <code className="rounded bg-fd-secondary px-1 text-sm">{'<span>'}</code> re-renders.
        </p>

        <div className="w-full max-w-xl rounded-xl border border-fd-border bg-fd-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-fd-border bg-fd-secondary px-4 py-2">
            <span className="text-xs text-fd-muted-foreground font-mono">src/counter.tsx</span>
            <span className="text-xs text-indigo-500 font-medium">Nova</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm font-mono leading-relaxed">
            <code>
              {`import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'

function Counter() {
  const count = signal(0)

  return (
    <div>
      <span>{() => count()}</span>
      <button onClick={() => count.update(n => n + 1)}>+</button>
    </div>
  )
}

mount(<Counter />, document.getElementById('app')!)`}
            </code>
          </pre>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-2xl font-bold text-fd-foreground">
            Why Nova?
          </h2>
          <p className="mb-10 text-center text-fd-muted-foreground">
            Designed from the ground up for minimal DOM work.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-fd-border bg-fd-card p-6 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
              >
                <div className="mb-3 text-2xl">{f.icon}</div>
                <h3 className="mb-2 font-semibold text-fd-foreground">{f.title}</h3>
                <p className="text-sm text-fd-muted-foreground leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick navigation */}
      <section className="border-t border-fd-border px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-fd-foreground">
            Explore the Docs
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group rounded-xl border border-fd-border bg-fd-card p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-fd-accent/30 transition-all"
              >
                <div className="font-semibold text-fd-foreground group-hover:text-indigo-500 transition-colors">
                  {s.title} →
                </div>
                <div className="mt-1 text-sm text-fd-muted-foreground">{s.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-fd-border px-6 py-8 text-center text-sm text-fd-muted-foreground">
        <p>
          Nova is open source —{' '}
          <a
            href="https://github.com/nova-framework/nova"
            className="text-indigo-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            star it on GitHub ↗
          </a>
        </p>
      </footer>
    </main>
  )
}
