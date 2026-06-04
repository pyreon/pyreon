import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { DocPlayground } from './DocPlayground'

/**
 * After a markdown page mounts, walk it once and upgrade two kinds of
 * placeholder nodes the markdown compiler emitted:
 *   - `<div data-pyreon-playground>` → real `<DocPlayground>` Pyreon
 *     component, with the code recovered from `data-code-b64`.
 *   - `<div data-pyreon-code-group>` → tab interaction wired up on the
 *     existing static DOM (CSS already handles the visual; we only
 *     need the click handler).
 *
 * This runs AFTER dangerouslySetInnerHTML has populated the article,
 * so it's idiomatic ref-callback usage (called with `el` on mount,
 * `null` on unmount).
 */
export function hydrateDocPage(el: HTMLElement | null) {
  if (el == null) return
  onMount(() => {
    upgradePlaygrounds(el)
    wireCodeGroups(el)
  })
}

function upgradePlaygrounds(root: HTMLElement) {
  const targets = root.querySelectorAll<HTMLElement>('div[data-pyreon-playground]')
  targets.forEach((node) => {
    const title = node.getAttribute('data-title') ?? 'Try it'
    const height = Number(node.getAttribute('data-height') ?? '200')
    const b64 = node.getAttribute('data-code-b64') ?? ''
    let code = ''
    try {
      // atob in browsers; in Node use Buffer (this only runs in browser
      // post-mount, but TypeScript/SSR-shape-wise be defensive)
      code = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf-8')
    } catch {
      code = ''
    }
    // Replace the placeholder with a fresh host the playground mounts into
    const host = document.createElement('div')
    node.replaceWith(host)
    mount(<DocPlayground title={title} code={code} height={height} />, host)
  })
}

function wireCodeGroups(root: HTMLElement) {
  const groups = root.querySelectorAll<HTMLElement>('div[data-pyreon-code-group]')
  groups.forEach((group) => {
    const active = signal(0)
    const tabs = group.querySelectorAll<HTMLButtonElement>('.tabs > button')
    const panels = group.querySelectorAll<HTMLElement>('.panel')
    tabs.forEach((btn, i) => {
      btn.addEventListener('click', () => active.set(i))
    })
    // Drive class state via an effect on `active`
    import('@pyreon/reactivity').then(({ effect }) => {
      effect(() => {
        const i = active()
        tabs.forEach((btn, j) => btn.classList.toggle('active', j === i))
        panels.forEach((p, j) => p.classList.toggle('active', j === i))
      })
    })
  })
}
