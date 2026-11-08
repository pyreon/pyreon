import { h } from '@pyreon/core'

// No loader, no renderMode export — mode 'auto' infers 'ssg'.
export default function Home() {
  return h('h1', null, 'AUTO_INFERRED_SSG_HOME')
}
