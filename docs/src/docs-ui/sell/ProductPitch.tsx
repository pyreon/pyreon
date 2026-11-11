import { useDocsData } from '../data'
import { DocsGlyph as Glyph } from '../glyph'
import { InstallCommand } from '../../site/kit/controls'
import { useLinkClick } from '../../site/kit/link'
import { Inline } from '../inline'

/**
 * `<ProductPitch id="form" />` — the pitch strip that opens a product
 * overview page: glyph tile, package and category, the product name as the
 * page's h1, its hook line and lede, the install command, a link to the
 * product page, and three facts. Everything comes from `content/<id>.json`
 * (`hero`), the same copy the product page prints. Renders nothing when the
 * page is not that product's overview or its content file is not in the app.
 */
export default function ProductPitch(props: { id: string }) {
  const p = useDocsData().product
  const click = useLinkClick()
  if (!p || p.id !== props.id) return null
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
        <a class="dx-pitch__link" href={p.route} onClick={click(p.route)}>
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
