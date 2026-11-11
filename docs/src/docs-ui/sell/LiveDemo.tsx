import { signal } from '@pyreon/reactivity'
import { useDocsData } from '../data'
import { SLOT_IDS } from './slots'
import { CodeFigure } from '../code-figure'
import { When } from '../when'
import { DEMOS } from '../../site/demos/registry'
import { Inline } from '../inline'

/**
 * `<LiveDemo id="form" />` — the product's live demo inside its docs, with
 * Preview / Code tabs. The demo is the SAME island the product page mounts
 * (`site/demos/`, real package, loads when it scrolls near), so the docs
 * never carry a second copy. Code shows the product's own "after" sample
 * (`difference.after`, else its first `comingFrom` port), highlighted at
 * build time. A product without a demo yet renders nothing: the slot lights
 * up when its demo lands in the registry.
 */
export default function LiveDemo(props: { id: string }) {
  const p = useDocsData().product
  if (!p || p.id !== props.id) return null
  const Demo = DEMOS[p.demo.component]
  if (!Demo) return null
  const sample = p.difference
    ? { label: p.difference.after.label, code: p.difference.after.code, html: p.difference.after.codeHtml }
    : p.comingFrom?.[0]
      ? { label: p.package, code: p.comingFrom[0].after, html: p.comingFrom[0].afterHtml }
      : undefined
  const tab = signal<'preview' | 'code'>('preview')
  const base = `dx-demo-${p.id}`
  const tabs: ('preview' | 'code')[] = sample ? ['preview', 'code'] : ['preview']
  const onKey = (e: KeyboardEvent) => {
    if (tabs.length < 2 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    const next = tab.peek() === 'preview' ? 'code' : 'preview'
    tab.set(next)
    document.getElementById(`${base}-tab-${next}`)?.focus()
  }
  return (
    <section class="dx-slot" aria-labelledby={SLOT_IDS.demo}>
      <h2 id={SLOT_IDS.demo}>Try it</h2>
      <div class="dx-demo">
        <div class="dx-demo__tabs" role="tablist" aria-label={`${p.name} demo`}>
          {tabs.map((t) => (
            <button
              type="button"
              role="tab"
              id={`${base}-tab-${t}`}
              class="dx-demo__tab"
              aria-selected={() => (tab() === t ? 'true' : 'false')}
              aria-controls={`${base}-${t}`}
              tabIndex={() => (tab() === t ? 0 : -1)}
              onClick={() => tab.set(t)}
              onKeyDown={onKey}
            >
              {t === 'preview' ? 'Preview' : 'Code'}
            </button>
          ))}
          <span class="dx-demo__sp" />
          <span class="dx-live">
            <i aria-hidden="true" />
            live · {p.package}
          </span>
        </div>
        <div class="dx-demo__panel dx-demo__preview" role="tabpanel" id={`${base}-preview`} aria-labelledby={`${base}-tab-preview`} hidden={() => tab() !== 'preview'}>
          <Demo />
        </div>
        <When on={sample}>
          <div class="dx-demo__panel" role="tabpanel" id={`${base}-code`} aria-labelledby={`${base}-tab-code`} hidden={() => tab() !== 'code'}>
            <CodeFigure label={sample?.label ?? ''} lang="tsx" source={sample?.code ?? ''} html={sample?.html} />
          </div>
        </When>
      </div>
      <p class="dx-demo__cap"><Inline text={p.demo.text} /></p>
    </section>
  )
}
