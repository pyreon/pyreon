import type { ReactNode } from 'react'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '@/lib/source'

interface Props {
  children: ReactNode
}

export default function Layout({ children }: Props) {
  return (
    <DocsLayout
      tree={source.pageTree}
      githubUrl="https://github.com/pyreon/pyreon"
      nav={{
        title: (
          <span className="flex items-center gap-2 font-bold text-lg">
            <span className="text-indigo-500">◆</span>
            Pyreon
          </span>
        ),
      }}
      sidebar={{
        banner: (
          <div className="rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-600 dark:text-indigo-400">
            v0.1.0 — fine-grained reactivity
          </div>
        ),
      }}
    >
      {children}
    </DocsLayout>
  )
}
