/**
 * Shared trees for the camelCase-SVG hydration locks (#4439). The HTML parser
 * case-adjusts every SVG element name in this list (HTML spec "adjust SVG tag
 * names"), so a server-rendered `<lineargradient>` parses as `linearGradient`.
 * MathML has no case-adjusted element names; `<math>` rides along to prove the
 * other foreign namespace still matches.
 *
 * The browser spec hydrates the literal server HTML below (runtime-server
 * cannot load in the page); `hydrate-svg-camelcase.test.tsx` asserts
 * `renderToString` emits exactly this string, so the two cannot drift.
 */
import { For, h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'

/** Every SVG element name the HTML parser case-adjusts. */
export const CAMEL_SVG_TAGS = [
  'altGlyph',
  'altGlyphDef',
  'altGlyphItem',
  'animateColor',
  'animateMotion',
  'animateTransform',
  'clipPath',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'foreignObject',
  'glyphRef',
  'linearGradient',
  'radialGradient',
  'textPath',
] as const

/**
 * One `<svg>` holding every camelCase element (each with a camelCase
 * attribute and a child, so the walk descends into it), plus a MathML island.
 * `onClick` on the gradient proves the adopted element is live after hydrate.
 */
export function camelSvgTree(onGradientClick: () => void): VNode {
  return h(
    'div',
    null,
    h(
      'svg',
      { viewBox: '0 0 20 20', preserveAspectRatio: 'none' },
      h(
        'defs',
        null,
        ...CAMEL_SVG_TAGS.map((tag) =>
          h(
            tag,
            tag === 'linearGradient'
              ? { id: `x-${tag}`, gradientUnits: 'userSpaceOnUse', onClick: onGradientClick }
              : { id: `x-${tag}` },
            h('desc', null, tag),
          ),
        ),
      ),
      h('circle', { cx: '10', cy: '10', r: '8', fill: 'url(#x-linearGradient)' }),
    ),
    h('math', null, h('mrow', null, h('mi', null, 'x'), h('mo', null, '+'), h('mn', null, '1'))),
  )
}

export const CAMEL_SVG_SSR =
  '<div><svg viewBox="0 0 20 20" preserveAspectRatio="none"><defs>' +
  CAMEL_SVG_TAGS.map((tag) =>
    tag === 'linearGradient'
      ? `<${tag} id="x-${tag}" gradientUnits="userSpaceOnUse"><desc>${tag}</desc></${tag}>`
      : `<${tag} id="x-${tag}"><desc>${tag}</desc></${tag}>`,
  ).join('') +
  '</defs><circle cx="10" cy="10" r="8" fill="url(#x-linearGradient)"></circle></svg>' +
  '<math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math></div>'

export interface SvgRow {
  id: number
  label: string
}

/**
 * A keyed `<For>` whose rows carry camelCase SVG elements with reactive prop
 * work, so rows 2..N take the row-plan replay (`hydration-plan.ts`), which
 * compared tags the same lowercased way.
 */
export function camelSvgRows(rows: () => SvgRow[], onStop: (id: number) => void): VNode {
  return h(
    'ul',
    null,
    h(For, {
      each: rows,
      by: (r: SvgRow) => r.id,
      children: (r: SvgRow) =>
        h(
          'li',
          null,
          h(
            'svg',
            { viewBox: '0 0 4 4' },
            h(
              'linearGradient',
              { id: `g${r.id}`, gradientUnits: () => r.label, onClick: () => onStop(r.id) },
              h('stop', { offset: '0' }),
            ),
            h(
              'clipPath',
              { id: `c${r.id}`, 'data-label': () => r.label },
              h('rect', { width: '4', height: '4' }),
            ),
          ),
        ),
    }),
  )
}

export const SVG_ROWS_DATA: SvgRow[] = [
  { id: 1, label: 'userSpaceOnUse' },
  { id: 2, label: 'objectBoundingBox' },
  { id: 3, label: 'userSpaceOnUse' },
]

export const SVG_ROWS_SSR =
  '<ul><!--pyreon-for--><li><svg viewBox="0 0 4 4"><linearGradient id="g1" gradientUnits="userSpaceOnUse"><stop offset="0"></stop></linearGradient><clipPath id="c1" data-label="userSpaceOnUse"><rect width="4" height="4"></rect></clipPath></svg></li><li><svg viewBox="0 0 4 4"><linearGradient id="g2" gradientUnits="objectBoundingBox"><stop offset="0"></stop></linearGradient><clipPath id="c2" data-label="objectBoundingBox"><rect width="4" height="4"></rect></clipPath></svg></li><li><svg viewBox="0 0 4 4"><linearGradient id="g3" gradientUnits="userSpaceOnUse"><stop offset="0"></stop></linearGradient><clipPath id="c3" data-label="userSpaceOnUse"><rect width="4" height="4"></rect></clipPath></svg></li><!--/pyreon-for:1 2 3--></ul>'
