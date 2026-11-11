import { color, font, gradient, layout, motion, navMedia, radius, text, weight, z, type ColorKey } from '../theme'
import { C } from './classes'

/**
 * The plain stylesheet for the site's ISLANDS (the nav, copy buttons, the
 * counter, the loops), generated from `theme.ts`.
 *
 * Why not rocketstyle: an island hydrates in the browser on a static page,
 * and a rocketstyle component there needs the UI system's styling runtime
 * (styler, unistyle, rocketstyle, elements, ui-core: ~25 KB gzip) just to
 * compute class names the server already printed. Islands therefore render
 * plain elements with the fixed class names in `classes.ts`, and this sheet
 * styles them. It is injected by `SiteShell` (server render, and the docs
 * app's client render), never by an island, so no island imports a styling
 * runtime. Static content keeps using the rocketstyle kit: it renders only on
 * the server.
 *
 * Colours are custom properties (`--c-<token>`) switched by
 * `<html data-theme>`, the same attribute the kit's CSS-variables mode uses.
 * Everything sits in `@layer site`, declared last in index.html.
 */

const v = (key: ColorKey) => `var(--c-${key})`
const vars = (mode: 'dark' | 'light') =>
  (Object.keys(color) as ColorKey[]).map((k) => `--c-${k}:${color[k][mode]};`).join('') +
  `--c-ember:${gradient.ember[mode]};`

const focus = `outline:2px solid ${v('focus')};outline-offset:2px;`
const reset = 'margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;'

export const SITE_CSS_KEY = 'pyreon-site-islands-v1'

export const SITE_CSS = `@layer site{
:root,:root[data-theme=dark]{${vars('dark')}}
:root[data-theme=light]{${vars('light')}}
pyreon-island{display:contents}
.${C.srOnly}{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}

.${C.header}{position:fixed;top:${layout.navTop}px;left:0;right:0;z-index:${z.nav};padding:0 ${layout.gutter.xs}px;pointer-events:none}
.${C.bar}{position:relative;z-index:${z.panel};pointer-events:auto;display:flex;align-items:center;gap:8px;max-width:${layout.navMaxWidth}px;height:${layout.navHeight}px;margin:0 auto;padding:0 8px 0 16px;border:1px solid ${v('line')};border-radius:${radius.pill}px;background:${v('glass')};backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);font-family:${font.sans}}
@media (min-width:576px){.${C.bar}{padding-left:20px}}
@media (min-width:992px){.${C.bar}{gap:24px}}
.${C.mark}{display:inline-flex;align-items:center;gap:10px;flex-shrink:0;color:${v('strong')};text-decoration:none;border-radius:${radius.small}px}
.${C.mark}:focus-visible{${focus}}
.${C.wordmark}{font-weight:${text.wordmark.weight};font-size:${text.wordmark.size}px;letter-spacing:-.02em}
@media (max-width:379.98px){.${C.wordmark}{display:none}}
.${C.crumbs}{display:flex;align-items:center;gap:8px;flex-shrink:0;padding-left:18px;border-left:1px solid ${v('line')};font-family:${font.mono};font-size:11.5px;color:${v('fog')}}
${navMedia.collapsed}{.${C.crumbs}{display:none}}
.${C.crumbs} a{color:${v('fog')};text-decoration:none;border-radius:4px}
.${C.crumbs} a:hover{color:${v('text')}}
.${C.crumbs} a:focus-visible{${focus}}
.${C.crumbs} [aria-current]{color:${v('text')}}
.${C.nav}{display:flex;align-items:center;gap:22px;height:100%}
${navMedia.collapsed}{.${C.nav}{display:none}}
.${C.navLink}{${reset}display:inline-flex;align-items:center;gap:6px;height:100%;font-size:${text.navLink.size}px;color:${v('mist')};text-decoration:none;white-space:nowrap;cursor:pointer;transition:color ${motion.hover}}
.${C.navLink}:hover,.${C.navLink}[aria-current],.${C.navLink}[aria-expanded=true],.${C.navLink}.${C.isCurrent}{color:${v('text')}}
.${C.navLink}:focus-visible{${focus};border-radius:${radius.small}px}
.${C.navLink} svg{transition:transform ${motion.panel}}
.${C.navLink}[aria-expanded=true] svg{transform:rotate(180deg)}
.${C.spacer}{flex:1 1 0;min-width:0}
.${C.iconLink},.${C.iconButton},.${C.menuButton}{${reset}display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:36px;height:36px;border-radius:${radius.pill}px;color:${v('mist')};cursor:pointer;transition:color ${motion.hover},border-color ${motion.hover}}
.${C.iconButton},.${C.menuButton}{border:1px solid ${v('line')}}
.${C.menuButton}{color:${v('text')}}
.${C.iconLink}:hover,.${C.iconButton}:hover{color:${v('text')}}
.${C.iconButton}:hover{border-color:${v('line2')}}
.${C.iconLink}:focus-visible,.${C.iconButton}:focus-visible,.${C.menuButton}:focus-visible{${focus}}
${navMedia.collapsed}{.${C.iconLink},.${C.desktopOnly}{display:none}}
${navMedia.expanded}{.${C.menuButton}{display:none}}
.${C.modeDark},.${C.modeLight}{display:flex}
:root[data-theme=light] .${C.modeDark},:root:not([data-theme=light]) .${C.modeLight}{display:none}
.${C.pill}{display:inline-flex;align-items:center;gap:10px;height:38px;padding:0 18px;border-radius:${radius.pill}px;border:1px solid ${v('line2')};font-family:${font.sans};font-size:${text.ui.size}px;font-weight:${weight.medium};line-height:1;white-space:nowrap;text-decoration:none;color:${v('text')};transition:border-color ${motion.hover},background-color ${motion.hover},transform ${motion.hover}}
.${C.pill}:hover{border-color:${v('lineHover')}}
.${C.pill}:focus-visible{${focus}}
.${C.pillSolid}{background:${v('solidBg')};border-color:${v('solidBg')};color:${v('solidText')}}
.${C.pillSolid}:hover{background:${v('solidHover')};border-color:${v('solidHover')};transform:translateY(-1px)}

@keyframes s-panel-in{from{opacity:0;transform:translateX(-50%) translateY(-4px)}to{opacity:1;transform:translateX(-50%)}}
.${C.panel}{position:absolute;top:62px;left:50%;z-index:${z.panel};max-width:calc(100vw - 32px);max-height:calc(100vh - 100px);overflow-y:auto;padding:20px;border-radius:${radius.panel}px;border:1px solid ${v('line2')};background:${v('panel')};box-shadow:${v('shadow')};transform:translateX(-50%);animation:s-panel-in ${motion.panel} both}
@media (prefers-reduced-motion:reduce){.${C.panel}{animation:none}}
.${C.panelWide}{width:1000px}
.${C.panelNarrow}{width:620px}
.${C.columns4}{display:grid;gap:6px 14px;grid-template-columns:repeat(4,minmax(0,1fr))}
.${C.columns2}{display:grid;gap:6px 14px;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
.${C.colTitle}{margin:0 0 6px;padding-left:8px;font-family:${font.mono};font-size:${text.eyebrowTight.size}px;letter-spacing:${text.eyebrowTight.tracking};font-weight:${weight.medium};text-transform:uppercase;color:${v('fog')}}
.${C.list}{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.${C.item}{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:${radius.control}px;text-decoration:none;color:${v('text')}}
.${C.item}:hover,.${C.item}:focus-visible{background:${v('hoverFill')}}
.${C.item}:focus-visible{outline:2px solid ${v('focus')};outline-offset:0}
.${C.item} svg{flex-shrink:0;margin-top:2px}
.${C.itemName}{display:block;font-size:${text.navLink.size}px;font-weight:${weight.medium}}
.${C.itemSub}{display:block;margin-top:1px;font-size:${text.mono.size}px;line-height:1.35;color:${v('fog')}}
.${C.badge}{margin-left:6px;padding:0 6px;border-radius:${radius.pill}px;border:1px solid ${v('warn')};color:${v('warn')};font-family:${font.mono};font-size:9.5px;font-weight:${weight.medium};letter-spacing:.08em;text-transform:uppercase;vertical-align:1px}
.${C.panelFoot}{display:flex;flex-wrap:wrap;gap:20px;list-style:none;margin:14px 0 0;padding:14px 0 0 8px;border-top:1px solid ${v('line')}}
.${C.panelFoot} a{font-size:13px;color:${v('mist')};text-decoration:none;border-radius:4px}
.${C.panelFoot} a:hover{color:${v('text')}}
.${C.panelFoot} a:focus-visible{${focus}}

.${C.sheet}{position:fixed;inset:0;z-index:${z.sheet};pointer-events:auto;overflow-y:auto;overscroll-behavior:contain;padding:${layout.sheetPadTop}px 20px 40px;background:${v('bg')};font-family:${font.sans}}
${navMedia.expanded}{.${C.sheet}{display:none}}
.${C.sheetList}{list-style:none;margin:0;padding:0}
.${C.bigLink}{display:block;padding:12px 0;font-size:${text.sheetLink.size}px;letter-spacing:-.02em;color:${v('text')};text-decoration:none;border-bottom:1px solid ${v('line')}}
.${C.bigLink}:focus-visible{outline:2px solid ${v('focus')};outline-offset:-2px;border-radius:${radius.small}px}
.${C.groupTitle}{margin:26px 0 8px;font-family:${font.mono};font-size:${text.eyebrowTight.size}px;letter-spacing:${text.eyebrowTight.tracking};font-weight:${weight.medium};text-transform:uppercase;color:${v('fog')}}
.${C.sheetGrid}{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
.${C.smallLink}{display:block;padding:10px 0;font-size:${text.small.size}px;color:${v('mist')};text-decoration:none;overflow-wrap:anywhere}
.${C.smallLink}[aria-current]{color:${v('text')}}
.${C.smallLink}:focus-visible{${focus};border-radius:${radius.small}px}
.${C.sheetInstall}{margin-top:28px}
.${C.sheetFoot}{display:flex;flex-wrap:wrap;gap:0 20px;list-style:none;margin:20px 0 0;padding:0}

.${C.cmd}{display:flex;align-items:center;gap:14px;height:50px;max-width:100%;min-width:0;padding:0 8px 0 14px;border-radius:${radius.pill}px;border:1px solid ${v('line2')};background:${v('sheen')};font-family:${font.mono};font-size:12px;color:${v('text')}}
@media (min-width:576px){.${C.cmd}{padding-left:22px;font-size:${text.ui.size}px}}
.${C.cmdHot}{border-color:${v('hotRing')};box-shadow:${v('hotGlow')}}
.${C.cmdText}{display:block;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit;color:inherit;background:none;padding:0;border:0}
.${C.cmdPrompt}{color:${v('prompt')};margin-right:8px}
.${C.copy}{${reset}display:inline-flex;align-items:center;flex-shrink:0;height:34px;padding:0 14px;border-radius:${radius.pill}px;background:${v('line')};color:${v('mist')};font-family:${font.mono};font-size:11.5px;cursor:pointer;transition:color ${motion.hover}}
.${C.copy}:hover{color:${v('text')}}
.${C.copy}:focus-visible{${focus}}
}`
