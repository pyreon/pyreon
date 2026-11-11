import type { ProductData } from '../../site/content/model'
import { DocsGlyph as Glyph } from '../glyph'
import { InstallCommand } from '../../site/kit/controls'
import { Inline } from '../inline'

/**
 * `<ProductPitch id="form" />` in an overview page's Markdown marks where the
 * pitch belongs: first. The docs page renders the pitch itself, as the page's
 * head (`PitchHead`, in place of the generic title, above the inline "On this
 * page"), so the tag renders nothing in the body.
 */
export default function ProductPitch(_props: { id: string }) {
  return null
}

/**
 * The pitch strip that opens a product overview page: glyph tile, package and
 * category, the product name as the page's h1, its hook line and lede, the
 * install command, a link to the product page, and three facts. Everything
 * comes from `content/<id>.json` (`hero`), the same copy the product page
 * prints. `DocsPage` renders it for a page whose product content is loaded.
 */
export function PitchHead(props: { product: ProductData }) {
  const p = props.product
  return (
    <header class="dx-pitch" id="overview">
      <div class="dx-pitch__pk">
        <span class="dx-tile">
          <Glyph id={p.id} size={22} />
        </span>
        <span>
          <b>{p.package}</b>
          <small>{p.category}</small>
        </span>
      </div>
      <h1>{p.name}</h1>
      <p class="dx-pitch__hook"><Inline text={p.hero.title} /></p>
      <p class="dx-pitch__lede"><Inline text={p.hero.lede} /></p>
      <div class="dx-pitch__ctas">
        <InstallCommand command={p.hero.install} />
        <a class="dx-pitch__link" href={p.route}>
          Product page →
        </a>
      </div>
      <dl class="dx-facts">
        {p.hero.facts.slice(0, 3).map((f) => (
          <div>
            <dt>{f.key}</dt>
            <dd><Inline text={f.value} /></dd>
          </div>
        ))}
      </dl>
    </header>
  )
}
