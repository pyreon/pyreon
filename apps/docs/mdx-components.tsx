import type { MDXComponents } from 'mdx/types'
import defaultComponents from 'fumadocs-ui/mdx'
import { Tabs, Tab } from 'fumadocs-ui/components/tabs'
import { Steps, Step } from 'fumadocs-ui/components/steps'
import { TypeTable } from 'fumadocs-ui/components/type-table'
import { Files, Folder, File } from 'fumadocs-ui/components/files'

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...(defaultComponents as MDXComponents),
    Tabs,
    Tab,
    Steps,
    Step,
    TypeTable,
    Files,
    Folder,
    File,
    ...components,
  }
}
